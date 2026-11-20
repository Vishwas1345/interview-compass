import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { validateKit } from "@interview-compass/shared";
import { runPipeline, CHECKPOINT_STEPS } from "../src/pipeline/run-pipeline.js";
import { PipelineError } from "../src/pipeline/errors.js";
import { JD, fakeLlm, testPipelineDeps as deps } from "./helpers/fake-llm.js";
import { startFixtureServer } from "./fixtures/server.js";

let fixtures;
before(async () => {
  fixtures = await startFixtureServer(0);
});
after(() => {
  fixtures.server.closeAllConnections();
  fixtures.server.close();
});

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

// --- checkpoints (resume) -------------------------------------------------

test("every resumable step is saved, in pipeline order", async () => {
  const saved = [];
  const d = { ...deps(fakeLlm()), onCheckpoint: async (key, value) => saved.push([key, value]) };
  await runPipeline({ company_url: `${fixtures.origin}/acme/`, jd: JD, days: 3 }, d);
  assert.deepEqual(saved.map(([key]) => key), CHECKPOINT_STEPS);
  assert.ok(JSON.parse(JSON.stringify(Object.fromEntries(saved))).crawl.pages[0].text, "page text is kept and serialisable");
});

test("a full checkpoint rebuilds the same kit with no model calls and no fetches", async () => {
  const saved = {};
  const input = { company_url: `${fixtures.origin}/acme/`, jd: JD, days: 3 };
  const first = await runPipeline(input, { ...deps(fakeLlm()), onCheckpoint: async (k, v) => (saved[k] = v) });
  const llm = fakeLlm();
  const d = { ...deps(llm), checkpoint: JSON.parse(JSON.stringify(saved)) };
  const second = await runPipeline(input, d);
  assert.equal(llm.calls.length, 0);
  assert.equal(d.fetcher.fetches, 0);
  assert.deepEqual(second.kit.questions, first.kit.questions);
  assert.deepEqual(second.usage, {}, "tokens from the earlier run are not counted again");
});

test("resuming after extraction and research skips them and continues", async () => {
  const saved = {};
  const input = { company_url: `${fixtures.origin}/acme/`, jd: JD, days: 3 };
  await runPipeline(input, { ...deps(fakeLlm()), onCheckpoint: async (k, v) => (saved[k] = v) });
  const llm = fakeLlm();
  const events = [];
  const d = { ...deps(llm), checkpoint: { role: saved.role, crawl: saved.crawl }, onProgress: (e) => events.push(e) };
  const { kit } = await runPipeline(input, d);
  assert.ok(!llm.calls.some((c) => c.label === "extract requirements"));
  assert.equal(d.fetcher.fetches, 0, "the website is not crawled again");
  assert.ok(llm.calls.some((c) => c.label === "company brief"), "later steps still run");
  assert.deepEqual(events.filter((e) => e.status === "reused").map((e) => e.step), ["extract requirements", "research company site"]);
  assert.equal(kit.role.requirements.length, 3);
});
