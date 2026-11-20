import { test } from "node:test";
import assert from "node:assert/strict";
import { findUncovered, closeGaps, MAX_COVERAGE_CHECKS } from "../src/pipeline/coverage/coverage.js";

const requirements = [
  { id: "r1", text: "Node.js", kind: "technical", priority: "must" },
  { id: "r2", text: "PostgreSQL", kind: "technical", priority: "must" },
  { id: "r3", text: "Mentoring juniors", kind: "behavioural", priority: "must" },
  { id: "r4", text: "Kubernetes", kind: "technical", priority: "nice" },
];

const question = (id, requirement_ids) => ({
  id,
  requirement_ids,
  category: "technical",
  prompt: `Question about ${requirement_ids.join(", ")}`,
  answer_outline: "",
  difficulty: 2,
});

// A fake generator that writes one question per requirement it is asked about,
// recording each call so tests can see what the loop asked for.
function fakeGenerator({ covers = (reqs) => reqs } = {}) {
  const calls = [];
  const generate = async (uncovered, { pass }) => {
    calls.push({ pass, ids: uncovered.map((r) => r.id) });
    return covers(uncovered).map((r) => ({ ...question(undefined, [r.id]), id: undefined }));
  };
  return { generate, calls };
}

test("findUncovered lists requirements no question points at", () => {
  const uncovered = findUncovered(requirements, [question("q1", ["r1"]), question("q2", ["r2", "r4"])]);
  assert.deepEqual(uncovered.map((r) => r.id), ["r3"]);
});

test("a question citing an unknown requirement covers nothing", () => {
  const uncovered = findUncovered(requirements, [question("q1", ["r9"])]);
  assert.equal(uncovered.length, requirements.length);
});

test("fully covered draft: one check, no generator call", async () => {
  const { generate, calls } = fakeGenerator();
  const draft = requirements.map((r, i) => question(`q${i + 1}`, [r.id]));
  const result = await closeGaps({ requirements, questions: draft, generateForGaps: generate });
  assert.equal(result.passes, 1);
  assert.equal(calls.length, 0);
  assert.deepEqual(result.uncovered_requirement_ids, []);
});

test("a gap is closed by the second pass, then checked again", async () => {
  const { generate, calls } = fakeGenerator();
  const draft = [question("q1", ["r1"]), question("q2", ["r2"])];
  const result = await closeGaps({ requirements, questions: draft, generateForGaps: generate });
  assert.deepEqual(calls, [{ pass: 1, ids: ["r3", "r4"] }]);
  assert.equal(result.passes, 2);
  assert.deepEqual(result.uncovered_requirement_ids, []);
  assert.deepEqual(result.log.map((e) => e.uncovered_requirement_ids), [["r3", "r4"], []]);
});

test("new questions get fresh ids that continue after the highest existing one", async () => {
  const { generate } = fakeGenerator();
  const draft = [question("q1", ["r1"]), question("q7", ["r2"])];
  const result = await closeGaps({ requirements, questions: draft, generateForGaps: generate });
  assert.deepEqual(result.questions.map((q) => q.id), ["q1", "q7", "q8", "q9"]);
});

test("the loop stops after the maximum number of checks", async () => {
  const { generate, calls } = fakeGenerator({ covers: () => [] }); // never helps
  const result = await closeGaps({ requirements, questions: [], generateForGaps: generate });
  assert.equal(result.passes, MAX_COVERAGE_CHECKS);
  assert.equal(calls.length, MAX_COVERAGE_CHECKS - 1);
});

test("must-haves still uncovered after the loop get a marked fallback question", async () => {
  const { generate } = fakeGenerator({ covers: () => [] });
  const result = await closeGaps({ requirements, questions: [], generateForGaps: generate });
  const fallbacks = result.questions.filter((q) => q.fallback);
  assert.deepEqual(fallbacks.map((q) => q.requirement_ids[0]), ["r1", "r2", "r3"]);
  assert.equal(fallbacks.find((q) => q.requirement_ids[0] === "r3").category, "behavioural");
  assert.ok(fallbacks.every((q) => q.prompt.length > 0 && q.difficulty === 2));
});

test("nice-to-haves may stay uncovered and are reported, never given a fallback", async () => {
  const { generate } = fakeGenerator({ covers: () => [] });
  const result = await closeGaps({ requirements, questions: [], generateForGaps: generate });
  assert.deepEqual(result.uncovered_requirement_ids, ["r4"]);
  assert.ok(!result.questions.some((q) => q.fallback && q.requirement_ids.includes("r4")));
});

test("generated questions citing unknown requirements are dropped", async () => {
  const generate = async () => [
    { ...question(undefined, ["r9"]) }, // nothing real: dropped
    { ...question(undefined, ["r3", "r9"]) }, // keeps only r3
  ];
  const draft = [question("q1", ["r1"]), question("q2", ["r2"]), question("q3", ["r4"])];
  const result = await closeGaps({ requirements, questions: draft, generateForGaps: generate });
  const added = result.questions.slice(3);
  assert.equal(added.length, 1);
  assert.deepEqual(added[0].requirement_ids, ["r3"]);
});

test("a failing gap pass is recorded and the loop carries on", async () => {
  let call = 0;
  const generate = async (uncovered) => {
    call += 1;
    if (call === 1) throw new Error("rate limited");
    return uncovered.map((r) => question(undefined, [r.id]));
  };
  const result = await closeGaps({ requirements, questions: [], generateForGaps: generate });
  assert.equal(result.log[0].error, "rate limited");
  assert.deepEqual(result.uncovered_requirement_ids, []);
  assert.ok(!result.questions.some((q) => q.fallback));
});

test("no requirements (thin posting): one check, nothing to do", async () => {
  const { generate, calls } = fakeGenerator();
  const result = await closeGaps({ requirements: [], questions: [question("q1", [])], generateForGaps: generate });
  assert.equal(result.passes, 1);
  assert.equal(calls.length, 0);
  assert.equal(result.questions.length, 1);
});

test("a custom makeId is used for every new question (builder never reuses ids)", async () => {
  const { generate } = fakeGenerator({ covers: () => [] });
  let n = 100;
  const result = await closeGaps({ requirements, questions: [], generateForGaps: generate, makeId: () => `q${(n += 1)}` });
  assert.deepEqual(result.questions.map((q) => q.id), ["q101", "q102", "q103"]);
});
