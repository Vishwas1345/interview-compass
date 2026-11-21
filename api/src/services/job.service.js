// Kit generation as a background job (D12). The kit document is the job's state:
// progress, saved step results (for resume), the final kit or the error. The page
// polls the document, so a reload or another device sees the same progress.

import { validateKit } from "@interview-compass/shared";
import { runPipeline } from "../pipeline/run-pipeline.js";
import { ERROR_CODES } from "../pipeline/errors.js";
import { planCategories } from "../pipeline/generation/categories.js";
import { generateQuestions, createGapGenerator } from "../pipeline/generation/questions.js";
import { writeBrief } from "../pipeline/generation/brief.js";
import { closeGaps, findUncovered } from "../pipeline/coverage/coverage.js";
import { mergeCategory, mergeBrief } from "./kit-merge.service.js";
import { createKitModel } from "../models/kit.model.js";

export const MERGE_ATTEMPTS = 3; // re-read and re-merge when an edit lands first

// kits: the kit model; db is accepted for convenience (tests and the server pass it).
export function createJobRunner({ db, kits = createKitModel(db), pipelineDeps, now = () => new Date(), log = console.error }) {
  const running = new Map(); // kitId string → promise

  const progressEvent = (event) => ({ ...event, at: now() });

  // Starts (or continues, from the saved checkpoint) the generation of a kit whose
  // status is already "generating". Returns the job's promise (tests await it).
  function start(kitId) {
    const key = String(kitId);
    if (running.has(key)) return running.get(key);
    const job = run(kitId)
      .catch(logFailure(kitId, "generation"))
      .finally(() => running.delete(key));
    running.set(key, job);
    return job;
  }

  // Jobs run without being awaited, so anything they throw (even while recording a
  // failure) must stop here: an unhandled rejection would end the whole process
  // (review C2). A kit left "generating" is marked interrupted on the next start.
  const logFailure = (kitId, what) => (error) => log(`${what} job for kit ${kitId} failed: ${error?.stack ?? error}`);

  async function run(kitId) {
    const doc = await kits.findById(kitId);
    if (!doc || doc.status !== "generating") return;
    const started = Date.now();
    // Progress writes are chained so they land in order, and flushed before the
    // final status write. A failed progress write never breaks the pipeline.
    let progressChain = Promise.resolve();
    const pushProgress = (event) => {
      progressChain = progressChain
        .then(() => kits.pushProgress(kitId, progressEvent(event)))
        .catch(() => {});
    };
    try {
      const { kit } = await runPipeline(doc.input, {
        ...pipelineDeps,
        checkpoint: doc.checkpoint ?? {},
        onCheckpoint: (step, result) => kits.saveCheckpoint(kitId, step, result, now()),
        onProgress: pushProgress,
      });
      await progressChain;
      await kits.markReady(
        kitId,
        {
          kit,
          version: 1,
          counters: { q: highestId(kit.questions, "q"), f: highestId(kit.flashcards, "f") },
          error: null,
          completedAt: now(),
          updatedAt: now(),
        },
        progressEvent({ step: "kit ready", status: "done", ms: Date.now() - started }),
      );
    } catch (error) {
      const code = error?.code && ERROR_CODES[error.code] ? error.code : ERROR_CODES.INTERNAL_ERROR;
      const message = code === ERROR_CODES.INTERNAL_ERROR ? "Something went wrong while generating this kit." : error.message;
      if (code === ERROR_CODES.INTERNAL_ERROR) log(`kit ${kitId} failed: ${error?.stack ?? error}`);
      await progressChain;
      await kits.markFailed(kitId, { code, message }, progressEvent({ step: "failed", status: "failed", message }), now());
    }
  }

  // One process runs every job (D9: a single Render instance), so on startup any
  // kit still marked "generating" lost its job in the restart.
  async function recoverOnBoot() {
    return kits.interruptAllGenerating(progressEvent({ step: "interrupted", status: "failed", message: "The server restarted during generation." }), now());
  }

  // --- regeneration (D8 rules 2, 4, 5) ---------------------------------------
  // The route has already set doc.regenerating (the per-kit lock).
  function regenerate(kitId, request) {
    const key = `regen:${kitId}`;
    if (running.has(key)) return running.get(key);
    const job = runRegeneration(kitId, request)
      .catch(logFailure(kitId, "regeneration"))
      .finally(() => running.delete(key));
    running.set(key, job);
    return job;
  }

  async function runRegeneration(kitId, { target, category, confirm }) {
    const { llm, models } = pipelineDeps;
    try {
      const doc = await kits.findById(kitId);
      const context = contextOf(doc);
      let fresh; // the model's work, done once; only the merge is retried
      if (target === "brief") {
        const crawl = doc.checkpoint?.crawl;
        if (!crawl) throw Object.assign(new Error("The research for this kit was not saved."), { code: "NOT_REGENERABLE" });
        fresh = await writeBrief({ companyName: doc.kit.source.company, crawl, llm, model: models.fast });
      } else {
        const item = categoryPlan(doc.kit, context, category);
        const inCategory = doc.kit.questions.filter((q) => q.category === category);
        const keptCount = inCategory.filter((q) => (q.state ?? "generated") !== "generated").length;
        ({ questions: fresh } = await generateQuestions({
          category,
          requirements: item.requirements,
          count: Math.max(1, item.count - keptCount),
          context,
          avoid: doc.kit.questions.map((q) => q.prompt), // kept ones and the ones being replaced
          dismissed: doc.dismissed?.[category] ?? [],
          llm,
          model: models.strong,
        }));
      }

      for (let attempt = 1; attempt <= MERGE_ATTEMPTS; attempt += 1) {
        const current = await kits.findById(kitId); // includes edits made meanwhile
        if (!current || current.status !== "ready") return;
        const result = target === "brief" ? mergeBriefInto(current, fresh, confirm) : await mergeCategoryInto(current, category, fresh, context);
        const check = validateKit(result.update.kit, { daysRequested: result.update.kit.schedule.days_available, coverage: "warn" });
        if (!check.ok) throw new Error(`regenerated kit invalid: ${check.errors[0].path}: ${check.errors[0].message}`);
        const saved = await kits.saveRegenerationIfVersion(kitId, current.version, {
          ...result.update,
          lastRegeneration: { target, category: category ?? null, ...result.summary, at: now(), error: null },
          updatedAt: now(),
        });
        if (saved) return;
      }
      throw new Error("the kit kept changing while the regeneration was saved");
    } catch (error) {
      const code = error?.code && (ERROR_CODES[error.code] || error.code === "NOT_REGENERABLE") ? error.code : ERROR_CODES.INTERNAL_ERROR;
      if (code === ERROR_CODES.INTERNAL_ERROR) log(`regeneration of kit ${kitId} failed: ${error?.stack ?? error}`);
      const message = code === ERROR_CODES.INTERNAL_ERROR ? "The regeneration failed; your kit is unchanged." : error.message;
      await kits.failRegeneration(kitId, { target, category: category ?? null, at: now(), error: { code, message } });
    }
  }

  function mergeBriefInto(doc, fresh, confirm) {
    const { kit, replaced } = mergeBrief(doc.kit, fresh, { confirm });
    return { update: { kit }, summary: { replaced } };
  }

  // Merge, then re-check coverage for the category's requirements: a gap the new
  // draft opened gets a gap pass (and a fallback for a must-have), like generation.
  async function mergeCategoryInto(doc, category, fresh, context) {
    const merged = mergeCategory({ kit: doc.kit, counters: doc.counters, scheduleStale: doc.scheduleStale }, category, fresh);
    const { kit, counters } = merged.state;
    const item = categoryPlan(kit, context, category);
    const gaps = await closeGaps({
      requirements: item.requirements,
      questions: kit.questions,
      generateForGaps: createGapGenerator({ context, llm: pipelineDeps.llm, model: pipelineDeps.models.strong }),
      makeId: () => `q${++counters.q}`,
    });
    kit.questions = gaps.questions;
    kit.coverage = {
      ...kit.coverage,
      uncovered_requirement_ids: findUncovered(kit.role.requirements, kit.questions).map((r) => r.id),
      passes: gaps.passes,
      log: gaps.log,
    };
    return {
      update: { kit, counters, scheduleStale: true },
      summary: { kept: merged.kept, removed: merged.removed, added: kit.questions.filter((q) => !doc.kit.questions.some((o) => o.id === q.id)).map((q) => q.id), coverage_log: gaps.log },
    };
  }

  async function recoverRegenerationsOnBoot() {
    return kits.clearStuckRegenerations({ at: now(), error: { code: "INTERRUPTED", message: "The server restarted during the regeneration; your kit is unchanged." } });
  }

  return {
    start,
    regenerate,
    recoverOnBoot: async () => (await recoverOnBoot()) + (await recoverRegenerationsOnBoot()),
    wait: (kitId) => Promise.all([running.get(String(kitId)), running.get(`regen:${kitId}`)]),
    running,
  };
}

// What the question prompts need: the role, the brief, and the interview process
// found at generation time.
function contextOf(doc) {
  const { kit } = doc;
  const stages = kit.research?.interview_stages ?? [];
  return {
    role: { title: kit.role.title, seniority: kit.role.seniority, responsibilities: kit.role.responsibilities },
    brief: kit.company_brief,
    process: doc.checkpoint?.process ?? { published: stages.length > 0, stages },
  };
}

// The category's requirements and target size, from the same code plan generation
// used. A category generation did not plan (e.g. system design for a mid-level role)
// still gets its natural requirements.
function categoryPlan(kit, context, category) {
  const plan = planCategories({ requirements: kit.role.requirements, stages: context.process.stages, seniority: kit.role.seniority });
  const planned = plan.find((p) => p.category === category);
  if (planned) return planned;
  const kinds = { technical: ["technical", "domain"], behavioural: ["behavioural"], "system-design": ["technical"], "company-fit": ["domain"] }[category];
  return { category, requirements: kit.role.requirements.filter((r) => kinds.includes(r.kind)), count: 3 };
}

// The builder numbers new items after the highest id ever used, so an id is never
// reused (D8). The highest id, not the count: the gap pass can leave gaps.
export function highestId(items, prefix) {
  let highest = 0;
  for (const item of items) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(item.id ?? "");
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}
