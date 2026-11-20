import { test } from "node:test";
import assert from "node:assert/strict";
import { planCategories } from "../src/pipeline/generation/categories.js";
import { generateQuestions, createGapGenerator, stageRules } from "../src/pipeline/generation/questions.js";
import { writeBrief } from "../src/pipeline/generation/brief.js";
import { readInterviewProcess } from "../src/pipeline/generation/interview-process.js";
import { makeFlashcards } from "../src/pipeline/generation/flashcards.js";

const requirements = [
  { id: "r1", text: "Node.js", kind: "technical", priority: "must" },
  { id: "r2", text: "Mentoring", kind: "behavioural", priority: "must" },
  { id: "r3", text: "Aerospace background", kind: "domain", priority: "nice" },
];
const categoriesOf = (plan) => plan.map((p) => p.category);

// --- category plan (code, not model) ---------------------------------------

test("a published system design round adds system-design questions", () => {
  const plan = planCategories({ requirements, stages: [{ kind: "system-design" }], seniority: "mid" });
  assert.ok(categoriesOf(plan).includes("system-design"));
  assert.match(plan.find((p) => p.category === "system-design").reason, /published interview process/);
});

test("the same mid-level posting with no published process gets no system-design", () => {
  const plan = planCategories({ requirements, stages: [], seniority: "mid" });
  assert.ok(!categoriesOf(plan).includes("system-design"));
});

test("a senior role with technical requirements gets system-design even without a published process", () => {
  assert.ok(categoriesOf(planCategories({ requirements, seniority: "senior" })).includes("system-design"));
});

test("technical and behavioural requirements go to separate calls", () => {
  const plan = planCategories({ requirements });
  const ids = (category) => plan.find((p) => p.category === category).requirements.map((r) => r.id);
  assert.deepEqual(ids("technical"), ["r1", "r3"]); // domain is tested technically
  assert.deepEqual(ids("behavioural"), ["r2"]);
});

test("behavioural and company-fit are always planned, even with no requirements", () => {
  assert.deepEqual(categoriesOf(planCategories({ requirements: [] })), ["behavioural", "company-fit"]);
});

// --- questions ---------------------------------------------------------------

const context = {
  role: { title: "Engineer", seniority: "mid", responsibilities: [] },
  brief: { summary: "s", what_they_do: "w" },
  process: { published: false, stages: [] },
};
const fakeLlm = (questions) => {
  const calls = [];
  return { calls, chatJson: async (call) => (calls.push(call), { data: { questions }, usage: { total_tokens: 1 } }) };
};

test("questions get the category from code, valid ids only, and clamped difficulty", async () => {
  const llm = fakeLlm([
    { prompt: "Event loop?", answer_outline: "a; b", difficulty: 5, requirement_ids: ["r1", "r9", "r1"] },
    { prompt: "Unrelated?", answer_outline: "", difficulty: 2, requirement_ids: ["r9"] }, // no valid id → dropped
  ]);
  const { questions } = await generateQuestions({ category: "technical", requirements: [requirements[0]], count: 3, context, llm, model: "m" });
  assert.equal(questions.length, 1);
  assert.deepEqual(questions[0].requirement_ids, ["r1"]);
  assert.equal(questions[0].category, "technical");
  assert.equal(questions[0].difficulty, 3);
  assert.equal(questions[0].state, "generated");
});

test("a question claiming more than three requirements keeps only the first three", async () => {
  const many = ["r1", "r2", "r3", "r4"].map((id) => ({ id, text: id, kind: "technical", priority: "must" }));
  const llm = fakeLlm([{ prompt: "Everything?", answer_outline: "", difficulty: 2, requirement_ids: ["r1", "r2", "r3", "r4"] }]);
  const { questions } = await generateQuestions({ category: "technical", requirements: many, count: 1, context, llm, model: "m" });
  assert.deepEqual(questions[0].requirement_ids, ["r1", "r2", "r3"]);
});

test("each category gets its own instructions", async () => {
  const llm = fakeLlm([]);
  await generateQuestions({ category: "technical", requirements, count: 3, context, llm, model: "m" });
  await generateQuestions({ category: "behavioural", requirements, count: 3, context, llm, model: "m" });
  assert.match(llm.calls[0].system, /TECHNICAL/);
  assert.match(llm.calls[1].system, /BEHAVIOURAL/);
  assert.notEqual(llm.calls[0].system, llm.calls[1].system);
});

test("the gap generator asks once per category, for exactly the uncovered requirements", async () => {
  const llm = fakeLlm([]);
  const generate = createGapGenerator({ context, llm, model: "m" });
  await generate([requirements[0], requirements[1], requirements[2]]);
  assert.equal(llm.calls.length, 2);
  assert.match(llm.calls[0].user, /r1 \(must\)/);
  assert.match(llm.calls[0].user, /r3 \(nice\)/);
  assert.match(llm.calls[1].user, /r2 \(must\)/);
  assert.match(llm.calls[0].system, /exactly one question for EACH/);
});

// --- honest paths that need no model call ------------------------------------

const noCallLlm = { chatJson: async () => assert.fail("the model should not be called") };

test("an unreachable site gets an honest brief without a model call", async () => {
  const brief = await writeBrief({ companyName: "Acme", crawl: { reachable: false, pages: [], skipped: [{ reason: "HTTP 404" }] }, llm: noCallLlm });
  assert.match(brief.summary, /could not be reached \(HTTP 404\)/);
  assert.deepEqual(brief.sources, []);
});

test("no hiring page and no discussion: no published process, no model call", async () => {
  const process = await readInterviewProcess({ crawl: { pages: [{ kind: "home" }] }, discussion: { sources: [] }, llm: noCallLlm });
  assert.deepEqual(process, { published: false, stages: [], source_urls: [], usage: null });
});

test("a homepage-only brief says so", async () => {
  const llm = { chatJson: async () => ({ data: { summary: "Makes panels.", what_they_do: "Panels." }, usage: {} }) };
  const crawl = { reachable: true, pages: [{ url: "http://x/", title: "X", text: "We make panels.", kind: "home" }], skipped: [] };
  const brief = await writeBrief({ companyName: "X", crawl, llm });
  assert.match(brief.summary, /homepage only/);
  assert.deepEqual(brief.sources, ["http://x/"]);
});

test("no questions means no flashcards and no model call", async () => {
  assert.deepEqual(await makeFlashcards({ questions: [], requirements, llm: noCallLlm }), { flashcards: [], usage: null });
});

test("process-specific rules are added by code only for stages that were found", () => {
  const process = { published: true, stages: [{ kind: "take-home" }, { kind: "system-design" }] };
  assert.equal(stageRules("technical", process).length, 1);
  assert.match(stageRules("technical", process)[0], /take-home/);
  assert.ok(!stageRules("technical", process).some((r) => /live coding|pair programming/.test(r)));
  assert.equal(stageRules("system-design", process).length, 1);
  assert.deepEqual(stageRules("technical", { published: false, stages: [] }), []);
});

test("the prompt carries the take-home rule only when a take-home was published", async () => {
  const llm = fakeLlm([]);
  const withTakeHome = { ...context, process: { published: true, stages: [{ name: "Take-home", kind: "take-home", description: "" }] } };
  await generateQuestions({ category: "technical", requirements, count: 3, context: withTakeHome, llm, model: "m" });
  await generateQuestions({ category: "technical", requirements, count: 3, context, llm, model: "m" });
  assert.match(llm.calls[0].system, /includes a take-home/);
  assert.doesNotMatch(llm.calls[1].system, /take-home/);
});
