import { test } from "node:test";
import assert from "node:assert/strict";
import { validateKit } from "@interview-compass/shared";
import { applyOp } from "../src/services/kit-ops.service.js";
import { allocateSchedule } from "../src/pipeline/schedule/allocate.js";

const requirements = [
  { id: "r1", text: "Node.js", kind: "technical", priority: "must" },
  { id: "r2", text: "Mentoring", kind: "behavioural", priority: "must" },
  { id: "r3", text: "Rust", kind: "technical", priority: "nice" },
];
const q = (id, category, reqs, extra = {}) => ({
  id, category, requirement_ids: reqs, prompt: `Prompt ${id}`, answer_outline: "", difficulty: 2, state: "generated", origin: "ai", ...extra,
});

function state() {
  const questions = [q("q1", "technical", ["r1"]), q("q2", "behavioural", ["r2"]), q("q3", "technical", ["r3"]), q("q4", "technical", ["r1"])];
  return {
    kit: {
      source: { company: "Acme", company_url: "acme.com", role: "Engineer", location: "", jd_chars: 10, researched_at: "x", pages_used: [] },
      company_brief: { summary: "S", what_they_do: "W", sources: [] },
      role: { title: "Engineer", seniority: "", responsibilities: [], requirements },
      questions,
      flashcards: [{ id: "f1", front: "F", back: "B", requirement_ids: ["r1"], state: "generated", origin: "ai" }, { id: "f2", front: "F2", back: "B2", requirement_ids: [], state: "generated", origin: "ai" }],
      schedule: allocateSchedule({ questions, requirements, days: 3 }),
      coverage: { uncovered_requirement_ids: [], passes: 1 },
    },
    counters: { q: 4, f: 2 },
    dismissed: {},
    scheduleStale: false,
  };
}
const question = (s, id) => s.kit.questions.find((x) => x.id === id);
const codeOf = (fn) => {
  try {
    fn();
  } catch (error) {
    return error.code ?? error.name;
  }
  return "no error";
};

test("editing a generated question marks it edited; saving the same text changes nothing", () => {
  const s = applyOp(state(), { type: "updateQuestion", id: "q1", fields: { prompt: "My own wording" } });
  assert.equal(question(s, "q1").prompt, "My own wording");
  assert.equal(question(s, "q1").state, "edited");
  const same = applyOp(state(), { type: "updateQuestion", id: "q1", fields: { prompt: "Prompt q1" } });
  assert.equal(question(same, "q1").state, "generated");
});

test("pin and unpin: a pinned AI question goes back to generated; one edited while pinned goes back to edited", () => {
  let s = applyOp(state(), { type: "setPinned", target: "question", id: "q1", pinned: true });
  assert.equal(question(s, "q1").state, "pinned");
  s = applyOp(s, { type: "setPinned", target: "question", id: "q1", pinned: false });
  assert.equal(question(s, "q1").state, "generated");

  s = applyOp(state(), { type: "setPinned", target: "question", id: "q1", pinned: true });
  s = applyOp(s, { type: "updateQuestion", id: "q1", fields: { prompt: "Edited while pinned" } });
  assert.equal(question(s, "q1").state, "pinned");
  s = applyOp(s, { type: "setPinned", target: "question", id: "q1", pinned: false });
  assert.equal(question(s, "q1").state, "edited", "the user's text stays protected");
});

test("an added question is the user's, edited, with a fresh id; the schedule goes stale", () => {
  const s = applyOp(state(), { type: "addQuestion", question: { category: "system-design", prompt: "Design X", requirement_ids: ["r1"] } });
  const added = s.kit.questions.at(-1);
  assert.deepEqual([added.id, added.origin, added.state, added.difficulty], ["q5", "user", "edited", 2]);
  assert.equal(s.scheduleStale, true);
});

test("ids are never reused: delete the newest question, add one, and it gets the next id", () => {
  let s = applyOp(state(), { type: "deleteQuestion", id: "q4" });
  s = applyOp(s, { type: "addQuestion", question: { category: "technical", prompt: "New" } });
  assert.equal(s.kit.questions.at(-1).id, "q5");
  s = applyOp(s, { type: "addFlashcard", flashcard: { front: "a", back: "b" } });
  assert.equal(s.kit.flashcards.at(-1).id, "f3");
});

test("deleting an AI question remembers it for regeneration, leaves the schedule at once, and updates coverage", () => {
  const s = applyOp(state(), { type: "deleteQuestion", id: "q2" });
  assert.deepEqual(s.dismissed, { behavioural: ["Prompt q2"] });
  assert.ok(!s.kit.schedule.days.some((d) => d.question_ids.includes("q2")));
  assert.deepEqual(s.kit.coverage.uncovered_requirement_ids, ["r2"]);
  const check = validateKit(s.kit, { coverage: "warn" });
  assert.equal(check.ok, true, "the kit still saves");
  assert.deepEqual(check.warnings.map((w) => w.requirement_id), ["r2"]);
});

test("deleting the user's own question is not remembered as dismissed", () => {
  let s = applyOp(state(), { type: "addQuestion", question: { category: "technical", prompt: "Mine" } });
  s = applyOp(s, { type: "deleteQuestion", id: "q5" });
  assert.deepEqual(s.dismissed, {});
});

test("moving a question changes its category, protects it, and puts it last in the new category", () => {
  const s = applyOp(state(), { type: "moveQuestion", id: "q1", category: "system-design" });
  const moved = question(s, "q1");
  assert.equal(moved.category, "system-design");
  assert.equal(moved.state, "edited");
  assert.equal(s.kit.questions.at(-1).id, "q1");
});

test("reordering a category keeps other categories in place and rejects a list that is not a permutation", () => {
  const s = applyOp(state(), { type: "reorder", kind: "questions", category: "technical", ids: ["q4", "q1", "q3"] });
  assert.deepEqual(s.kit.questions.map((x) => x.id), ["q4", "q2", "q1", "q3"]);
  assert.equal(codeOf(() => applyOp(state(), { type: "reorder", kind: "questions", category: "technical", ids: ["q4", "q1"] })), "INVALID_OP");
  assert.equal(codeOf(() => applyOp(state(), { type: "reorder", kind: "questions", category: "technical", ids: ["q4", "q1", "q2"] })), "INVALID_OP");
  const cards = applyOp(state(), { type: "reorder", kind: "flashcards", ids: ["f2", "f1"] });
  assert.deepEqual(cards.kit.flashcards.map((f) => f.id), ["f2", "f1"]);
});

test("changing days rebuilds an exact schedule in code and clears the stale flag", () => {
  for (const days of [1, 60]) {
    const s = applyOp({ ...state(), scheduleStale: true }, { type: "setDays", days });
    assert.equal(s.kit.schedule.days.length, days);
    assert.equal(s.scheduleStale, false);
    assert.equal(validateKit(s.kit, { daysRequested: days }).ok, true);
  }
});

test("brief edits mark the field edited; an edit to a pinned field keeps it pinned", () => {
  let s = applyOp(state(), { type: "updateBrief", fields: { summary: "Mine" } });
  assert.deepEqual(s.kit.company_brief.field_state, { summary: "edited", what_they_do: "generated" });
  s = applyOp(state(), { type: "setPinned", target: "brief", field: "what_they_do", pinned: true });
  s = applyOp(s, { type: "updateBrief", fields: { what_they_do: "Mine too" } });
  assert.equal(s.kit.company_brief.field_state.what_they_do, "pinned");
});

test("bad operations are refused: unknown ids, unknown requirements, empty or oversized text", () => {
  assert.equal(codeOf(() => applyOp(state(), { type: "updateQuestion", id: "q99", fields: { prompt: "x" } })), "INVALID_OP");
  assert.equal(codeOf(() => applyOp(state(), { type: "addQuestion", question: { category: "technical", prompt: "x", requirement_ids: ["r9"] } })), "INVALID_OP");
  assert.equal(codeOf(() => applyOp(state(), { type: "updateQuestion", id: "q1", fields: { prompt: "   " } })), "ZodError");
  assert.equal(codeOf(() => applyOp(state(), { type: "updateQuestion", id: "q1", fields: { prompt: "x".repeat(2001) } })), "ZodError");
  assert.equal(codeOf(() => applyOp(state(), { type: "dropTable" })), "ZodError");
});

test("applyOp never changes the state it was given", () => {
  const before = state();
  const copy = structuredClone(before);
  applyOp(before, { type: "deleteQuestion", id: "q1" });
  applyOp(before, { type: "setDays", days: 7 });
  assert.deepEqual(before, copy);
});
