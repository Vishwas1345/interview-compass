import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { validateKit } from "@interview-compass/shared";
import { runPipeline } from "../src/pipeline/run-pipeline.js";
import { createFetcher } from "../src/pipeline/retrieval/fetch-page.js";
import { PipelineError } from "../src/pipeline/errors.js";
import { startFixtureServer } from "./fixtures/server.js";

let fixtures;
before(async () => {
  fixtures = await startFixtureServer(0);
});
after(() => {
  fixtures.server.closeAllConnections();
  fixtures.server.close();
});

const JD = `Senior Backend Engineer
What you need
- Strong experience with Node.js in production
- You mentor other engineers
Bonus points for
- Aerospace background`;

const REQUIREMENTS = [
  { text: "Node.js in production", quote: "Strong experience with Node.js in production", kind: "technical", priority: "must" },
  { text: "Mentoring", quote: "You mentor other engineers", kind: "behavioural", priority: "must" },
  { text: "Aerospace background", quote: "Aerospace background", kind: "domain", priority: "nice" },
];

// Answers each call by its label, like the real steps would; records every call.
function fakeLlm({ requirements = REQUIREMENTS, questions, failLabel } = {}) {
  const calls = [];
  const reply = (data) => ({ data, usage: { total_tokens: 10 } });
  return {
    calls,
    chatJson: async ({ label, model, user }) => {
      calls.push({ label, model, user });
      if (failLabel && label.startsWith(failLabel)) {
        throw new PipelineError("LLM_BAD_OUTPUT", `${label}: the model returned invalid output twice.`);
      }
      if (label === "extract requirements") {
        return reply({ title: "Senior Backend Engineer", seniority: "senior", location: "Remote", responsibilities: ["Build APIs"], requirements });
      }
      if (label === "company brief") return reply({ summary: "Acme builds rockets.", what_they_do: "Rockets." });
      if (label === "interview process") {
        return reply({ stages: [{ name: "Take-home", kind: "take-home", description: "A small project." }, { name: "Design", kind: "system-design", description: "" }] });
      }
      if (label.startsWith("questions: ") || label.startsWith("gap pass")) {
        const ids = [...user.matchAll(/- (r\d+) \(/g)].map((m) => m[1]);
        if (ids.length === 0) return reply({ questions: [{ prompt: `General (${label})?`, answer_outline: "", difficulty: 1, requirement_ids: [] }] });
        const list = questions ? questions(label, ids) : ids.map((id) => ({ prompt: `About ${id} (${label})?`, answer_outline: "a; b", difficulty: 2, requirement_ids: [id] }));
        return reply({ questions: list });
      }
      if (label === "flashcards") return reply({ flashcards: [{ front: "Event loop?", back: "Phases.", requirement_ids: ["r1"] }] });
      throw new Error(`unexpected call ${label}`);
    },
  };
}

function deps(llm) {
  return {
    llm,
    models: { strong: "strong", fast: "fast" },
    fetcher: createFetcher({ allowPrivate: true, minIntervalMs: 0, sleep: async () => {} }),
    tavilyApiKey: "",
    searchFetch: async () => assert.fail("a private fixture host must not be searched"),
    now: () => new Date("2026-11-21T10:00:00Z"),
  };
}

test("a full run produces a valid kit shaped by the published process", async () => {
  const llm = fakeLlm();
  const { kit, usage } = await runPipeline({ company_url: `${fixtures.origin}/acme/`, jd: JD, days: 5 }, deps(llm));

  assert.equal(validateKit(kit, { daysRequested: 5 }).ok, true);
  assert.deepEqual(kit.role.requirements.map((r) => r.id), ["r1", "r2", "r3"]);
  assert.equal(kit.schedule.days.length, 5);
  assert.deepEqual(kit.coverage.uncovered_requirement_ids, []);
  assert.equal(kit.coverage.passes, 1);
  assert.ok(kit.research.hiring_page_found);
  assert.ok(kit.question_plan.some((p) => p.category === "system-design" && /published interview process/.test(p.reason)));
  assert.deepEqual(kit.questions.map((q) => q.id), kit.questions.map((_, i) => `q${i + 1}`));
  assert.equal(kit.flashcards[0].id, "f1");
  assert.equal(kit.source.researched_at, "2026-11-21T10:00:00.000Z");
  assert.ok(kit.source.pages_used.length > 1);
  assert.ok(usage.strong > 0 && usage.fast > 0);
});

test("an unreachable site still gives an ok kit, with an honest brief and note", async () => {
  const llm = fakeLlm();
  const { kit } = await runPipeline({ company_url: `${fixtures.origin}/missing/`, jd: JD, days: 3 }, deps(llm));
  assert.match(kit.company_brief.summary, /could not be reached/);
  assert.ok(kit.research.notes.some((n) => /could not be reached/.test(n)));
  assert.ok(!llm.calls.some((c) => c.label === "company brief"), "no brief call for an unreachable site");
  assert.ok(!kit.question_plan.some((p) => p.reason.includes("published")));
});

test("an invalid company URL is treated like an unreachable site, not a failure", async () => {
  const { kit } = await runPipeline({ company_url: "ftp://acme.example", jd: JD, days: 2 }, deps(fakeLlm()));
  assert.match(kit.research.pages_tried[0].reason, /Only http and https/);
  assert.equal(kit.source.pages_used.length, 0);
});

test("a posting with no requirements gives an ok thin kit that says so", async () => {
  const { kit } = await runPipeline({ company_url: `${fixtures.origin}/quiet/`, jd: "Engineer", days: 2 }, deps(fakeLlm({ requirements: [] })));
  assert.equal(kit.role.requirements.length, 0);
  assert.ok(kit.questions.length > 0, "general behavioural and company-fit questions");
  assert.ok(kit.research.notes.some((n) => /No requirements could be found/.test(n)));
  assert.ok(kit.research.notes.some((n) => /No hiring or interview-process page/.test(n)));
});

test("a category the model leaves uncovered is closed by a gap pass", async () => {
  // The first technical call ignores r3; the gap pass then covers it.
  const llm = fakeLlm({
    questions: (label, ids) =>
      ids.filter((id) => !(label === "questions: technical" && id === "r3"))
        .filter((id) => !(label.startsWith("questions: ") && label !== "questions: technical" && id === "r3"))
        .map((id) => ({ prompt: `About ${id} (${label})?`, answer_outline: "", difficulty: 2, requirement_ids: [id] })),
  });
  const { kit } = await runPipeline({ company_url: `${fixtures.origin}/acme/`, jd: JD, days: 4 }, deps(llm));
  assert.equal(kit.coverage.passes, 2);
  assert.deepEqual(kit.coverage.log[0].uncovered_requirement_ids, ["r3"]);
  assert.ok(llm.calls.some((c) => c.label === "gap pass (technical)"));
  assert.deepEqual(kit.coverage.uncovered_requirement_ids, []);
});

test("a broken model answer in one step degrades that step only", async () => {
  const { kit } = await runPipeline({ company_url: `${fixtures.origin}/acme/`, jd: JD, days: 3 }, deps(fakeLlm({ failLabel: "flashcards" })));
  assert.deepEqual(kit.flashcards, []);
  assert.ok(kit.questions.length > 0);
});

test("extraction failure fails the case with its code", async () => {
  await assert.rejects(
    runPipeline({ company_url: `${fixtures.origin}/acme/`, jd: JD, days: 3 }, deps(fakeLlm({ failLabel: "extract" }))),
    (error) => error instanceof PipelineError && error.code === "LLM_BAD_OUTPUT",
  );
});

test("empty posting and out-of-range days are rejected before any work", async () => {
  const llm = fakeLlm();
  await assert.rejects(runPipeline({ company_url: "x", jd: "   ", days: 3 }, deps(llm)), { code: "INVALID_INPUT" });
  await assert.rejects(runPipeline({ company_url: "x", jd: JD, days: 0 }, deps(llm)), { code: "INVALID_INPUT" });
  await assert.rejects(runPipeline({ company_url: "x", jd: JD, days: 2.5 }, deps(llm)), { code: "INVALID_INPUT" });
  assert.equal(llm.calls.length, 0);
});
