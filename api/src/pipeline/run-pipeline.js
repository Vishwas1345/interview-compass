// The pipeline (spec steps 1–11): job description + company URL + days → a
// validated prep kit. Each step lives in its own module; this file only runs them
// in order, assigns ids, writes the honest notes and checks the result.
//
// Fails (throws PipelineError) only when no kit can be produced: bad input, the
// extraction step failing, or the model service staying unavailable. Everything
// else (unreachable site, nothing found, one bad model answer) degrades honestly.

import { validateKit, DAYS_MIN, DAYS_MAX } from "@interview-compass/shared";
import { PipelineError, ERROR_CODES } from "./errors.js";
import { normalizeUrl, UrlRejectedError } from "./retrieval/url-guard.js";
import { createRobots } from "./retrieval/robots.js";
import { crawlCompany } from "./retrieval/crawl.js";
import { searchDiscussion } from "./retrieval/search.js";
import { extractRequirements } from "./extraction/extract-requirements.js";
import { writeBrief } from "./generation/brief.js";
import { readInterviewProcess } from "./generation/interview-process.js";
import { planCategories } from "./generation/categories.js";
import { generateQuestions, createGapGenerator } from "./generation/questions.js";
import { makeFlashcards } from "./generation/flashcards.js";
import { closeGaps } from "./coverage/coverage.js";
import { allocateSchedule } from "./schedule/allocate.js";
import { createLlmClient } from "../llm/client.js";
import { createFetcher } from "./retrieval/fetch-page.js";

// A posting with this many requirements or fewer gets a "this kit is short" note.
export const THIN_REQUIREMENT_COUNT = 3;

// Steps whose results are saved for resume, in pipeline order.
export const CHECKPOINT_STEPS = ["role", "crawl", "discussion", "brief", "process", "drafted", "coverage", "flashcards"];

// The real dependencies from config, shared by the batch command and the API so
// both run the same code path. Build once per process: the LLM client holds the
// per-model rate budget, which must be shared by every run.
export function createPipelineDeps(config, { log = () => {} } = {}) {
  return {
    llm: createLlmClient({ baseUrl: config.llm.baseUrl, apiKey: config.llm.apiKey, log }),
    models: { strong: config.llm.model, fast: config.llm.fastModel },
    fetcher: createFetcher({ allowPrivate: config.allowPrivateUrls }),
    tavilyApiKey: config.tavilyApiKey,
  };
}

// input: { company_url, jd, days }
// deps:  { llm, models: { strong, fast }, fetcher, tavilyApiKey, searchFetch, now, onProgress,
//          checkpoint, onCheckpoint }
// checkpoint: results of steps finished in an earlier, interrupted run, keyed by
// CHECKPOINT_STEPS; those steps are reused (reported as "reused") instead of re-run.
// onCheckpoint(key, result) is awaited after each of those steps finishes.
// → { kit, usage: { [model]: total_tokens }, timings: [{ step, ms }] }
export async function runPipeline(input, deps) {
  const { jd, days, companyUrl } = checkInput(input);
  const { llm, models, fetcher, tavilyApiKey, searchFetch, now = () => new Date(), onProgress = () => {} } = deps;
  const { checkpoint = {}, onCheckpoint = async () => {} } = deps;

  const usage = {};
  const track = (model) => (u) => {
    if (u?.total_tokens) usage[model] = (usage[model] ?? 0) + u.total_tokens;
  };
  const strongUsage = track(models.strong);
  const fastUsage = track(models.fast);
  const timings = [];
  const step = async (name, fn, key) => {
    if (key && checkpoint[key] !== undefined) {
      onProgress({ step: name, status: "reused" });
      const saved = checkpoint[key];
      // Tokens spent in the earlier run are not counted again.
      return saved && typeof saved === "object" && !Array.isArray(saved) ? { ...saved, usage: null } : saved;
    }
    onProgress({ step: name, status: "started" });
    const started = Date.now();
    const result = await fn();
    const ms = Date.now() - started;
    timings.push({ step: name, ms });
    if (key) await onCheckpoint(key, result);
    onProgress({ step: name, status: "done", ms });
    return result;
  };
  const log = (message) => onProgress({ step: "log", message });

  // 1. Requirements. A failure here fails the case: without it there is no kit.
  const role = await step("extract requirements", () => extractRequirements({ jd, llm, model: models.strong, log }), "role");
  strongUsage(role.usage);

  // 2. Company website. An invalid address is treated like an unreachable site.
  const crawl = await step("research company site", () => crawlSafely(companyUrl, { fetcher, log }), "crawl");

  // 3. Public discussion of the interview process.
  const discussion = await step("search public discussion", () =>
    searchDiscussion({ companyName: crawl.companyName, companyUrl, tavilyApiKey, fetch: searchFetch, log }),
    "discussion",
  );

  // 4–5. Brief and interview process (fast model). A bad answer degrades, never fails.
  const brief = await step("write company brief", () =>
    softly(() => writeBrief({ companyName: crawl.companyName, crawl, llm, model: models.fast }), {
      summary: "A company brief could not be written from the pages found.",
      what_they_do: "Unknown.",
      sources: [],
      usage: null,
    }),
    "brief",
  );
  fastUsage(brief.usage);

  const process = await step("read interview process", () =>
    softly(() => readInterviewProcess({ crawl, discussion, llm, model: models.fast }), {
      published: false,
      stages: [],
      source_urls: [],
      usage: null,
      failed: true,
    }),
    "process",
  );
  fastUsage(process.usage);

  // 6. Categories, decided in code.
  const plan = planCategories({ requirements: role.requirements, stages: process.stages, seniority: role.seniority });

  // 7. One call per category. An empty or broken category is left to the gap loop.
  const context = {
    role: { title: role.title, seniority: role.seniority, responsibilities: role.responsibilities },
    brief,
    process,
  };
  const drafted = await step("generate questions", async () => {
    const all = [];
    for (const item of plan) {
      const result = await softly(
        () =>
          generateQuestions({
            category: item.category,
            requirements: item.requirements,
            count: item.count,
            context,
            avoid: all.map((q) => q.prompt),
            llm,
            model: models.strong,
          }),
        { questions: [], usage: null },
      );
      strongUsage(result.usage);
      log(`questions: ${item.category} → ${result.questions.length} (${item.reason})`);
      all.push(...result.questions);
    }
    return all.map((q, i) => ({ id: `q${i + 1}`, ...q }));
  }, "drafted");

  // 8. Coverage check and gap loop, in code.
  const coverage = await step("check coverage", () =>
    closeGaps({
      requirements: role.requirements,
      questions: drafted,
      generateForGaps: createGapGenerator({ context, llm, model: models.strong, onUsage: strongUsage }),
    }),
    "coverage",
  );

  for (const entry of coverage.log) {
    const gaps = entry.uncovered_requirement_ids;
    log(`coverage: check ${entry.check}: ${gaps.length === 0 ? "every requirement covered" : `${gaps.length} uncovered (${gaps.join(", ")})`}${entry.added ? `, gap pass added ${entry.added}` : ""}${entry.fallbacks ? `, fallback for ${entry.fallbacks.join(", ")}` : ""}`);
  }

  // 9. Flashcards (fast model).
  const cards = await step("make flashcards", () =>
    softly(() => makeFlashcards({ questions: coverage.questions, requirements: role.requirements, llm, model: models.fast }), {
      flashcards: [],
      usage: null,
    }),
    "flashcards",
  );
  fastUsage(cards.usage);

  // 10. Schedule, in code.
  const schedule = allocateSchedule({ questions: coverage.questions, requirements: role.requirements, days });

  // 11. Assemble and validate.
  const kit = {
    source: {
      company: crawl.companyName,
      company_url: companyUrl,
      role: role.title,
      location: role.location,
      jd_chars: jd.length,
      researched_at: now().toISOString(),
      pages_used: crawl.pages.map((p) => p.url),
    },
    company_brief: { summary: brief.summary, what_they_do: brief.what_they_do, sources: brief.sources },
    role: {
      title: role.title,
      seniority: role.seniority,
      responsibilities: role.responsibilities,
      requirements: role.requirements,
    },
    questions: coverage.questions,
    flashcards: cards.flashcards.map((card, i) => ({ id: `f${i + 1}`, ...card })),
    schedule,
    coverage: {
      uncovered_requirement_ids: coverage.uncovered_requirement_ids,
      passes: coverage.passes,
      log: coverage.log, // additive: what each check found and what the gap passes added
    },
    question_plan: plan.map(({ category, count, reason }) => ({ category, count, reason })), // additive
    research: {
      pages_tried: [
        ...crawl.pages.map((p) => ({ url: p.url, status: "used", kind: p.kind })),
        ...crawl.skipped.map((s) => ({ url: s.url, status: "skipped", reason: s.reason })),
      ],
      about_page_found: crawl.aboutFound,
      hiring_page_found: crawl.hiringFound,
      discussion_found: discussion.found,
      discussion_sources: discussion.sources.map(({ provider, title, url }) => ({ provider, title, url })),
      interview_stages: process.stages,
      company_named_in_posting: crawl.reachable ? companyNamedIn(jd, crawl.companyName) : null, // additive
      notes: writeNotes({ jd, role, crawl, discussion, process, coverage }),
    },
  };

  const check = validateKit(kit, { daysRequested: days });
  if (!check.ok) {
    const first = check.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new PipelineError(ERROR_CODES.INTERNAL_ERROR, `The generated kit failed validation (${first}).`);
  }
  return { kit, usage, timings };
}

function checkInput(input) {
  const jd = typeof input?.jd === "string" ? input.jd.trim() : "";
  if (!jd) throw new PipelineError(ERROR_CODES.INVALID_INPUT, "The job description is empty.");
  const days = input.days;
  if (!Number.isInteger(days) || days < DAYS_MIN || days > DAYS_MAX) {
    throw new PipelineError(ERROR_CODES.INVALID_INPUT, `Days must be a whole number from ${DAYS_MIN} to ${DAYS_MAX}.`);
  }
  return { jd, days, companyUrl: typeof input.company_url === "string" ? input.company_url.trim() : "" };
}

// An address typed without a scheme ("acme.com", "localhost:8099/acme/") is tried
// as https first; if the site cannot be reached that way, as plain http before
// giving up (seen live: an http-only site failed with an SSL error).
async function crawlSafely(companyUrl, { fetcher, log }) {
  const first = await crawlOnce(companyUrl, { fetcher, log });
  if (first.reachable || /^[a-z][a-z0-9+.-]*:\/\//i.test(companyUrl) || first.skipped.length === 0) return first;
  log(`crawl: https failed (${first.skipped[0].reason}); trying http://`);
  const second = await crawlOnce(`http://${companyUrl}`, { fetcher, log });
  return { ...second, skipped: [...first.skipped, ...second.skipped] };
}

async function crawlOnce(companyUrl, { fetcher, log }) {
  try {
    return await crawlCompany(companyUrl, { fetcher, robots: createRobots(fetcher), log });
  } catch (error) {
    if (!(error instanceof UrlRejectedError)) throw error;
    let companyName = "";
    try {
      companyName = normalizeUrl(companyUrl).hostname.replace(/^www\./, "");
    } catch {
      // no usable host either
    }
    return {
      reachable: false,
      companyName,
      homepage: companyUrl,
      pages: [],
      skipped: [{ url: companyUrl, reason: error.message }],
      aboutFound: false,
      hiringFound: false,
    };
  }
}

// A step whose model answer stays broken after the client's repair retry falls
// back to an honest default. An unavailable or unconfigured model still fails the case.
async function softly(fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PipelineError && error.code === ERROR_CODES.LLM_BAD_OUTPUT) return { ...fallback, error: error.message };
    throw error;
  }
}

function writeNotes({ jd, role, crawl, discussion, process, coverage }) {
  const notes = [];
  if (crawl.reachable && crawl.companyName && !companyNamedIn(jd, crawl.companyName)) {
    notes.push(`The posting does not mention ${crawl.companyName}. Check that the website belongs to this employer: the brief and company questions come from that site.`);
  }
  const n = role.requirements.length;
  if (n === 0) {
    notes.push("No requirements could be found in this posting, so the questions are general to the role and the company.");
  } else if (n <= THIN_REQUIREMENT_COUNT) {
    notes.push(`This posting lists only ${n} requirement${n === 1 ? "" : "s"}, so this kit is short.`);
  }
  if (role.dropped.length > 0) {
    notes.push(`${role.dropped.length} requirement(s) proposed by the model were dropped because their wording was not found in the posting.`);
  }
  if (!crawl.reachable) {
    const reason = crawl.skipped[0]?.reason;
    notes.push(`The company website could not be reached${reason ? ` (${reason})` : ""}; the kit is built from the job description alone.`);
  } else {
    if (!crawl.aboutFound) notes.push("No about page was found on the company site; the brief is based on the pages listed.");
    if (!crawl.hiringFound) notes.push("No hiring or interview-process page was found on the company site.");
  }
  if (discussion.skipped_reason) notes.push(`Public discussion was not searched: ${discussion.skipped_reason}.`);
  else if (!discussion.found) notes.push("No public discussion of this company's interview process was found.");
  if (process.failed) notes.push("The interview process could not be read from the pages found.");
  else if (!process.published) notes.push("No published interview process was found, so questions follow the posting alone.");
  const fallbacks = coverage.questions.filter((q) => q.fallback).length;
  if (fallbacks > 0) notes.push(`${fallbacks} must-have requirement(s) got a plain fallback question because the model did not cover them.`);
  return notes;
}

// Does the posting name the company found on the website? Whole words, any case:
// the full name, or its first distinctive word ("Acme" for "Acme Rockets").
// Catches a posting pasted with another company's website (seen live).
const GENERIC_NAME_WORDS = new Set(["the", "inc", "llc", "ltd", "labs", "lab", "company", "group", "technologies", "technology", "software", "ai", "hq"]);
export function companyNamedIn(jd, companyName) {
  const words = String(companyName).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
  const first = words.find((w) => !GENERIC_NAME_WORDS.has(w.toLowerCase()));
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = (text) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(text)}($|[^\\p{L}\\p{N}])`, "iu").test(jd);
  return named(companyName.trim()) || (first ? named(first) : true);
}
