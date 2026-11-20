import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCategory, mergeBrief } from "../src/kits/merge.js";

const q = (id, category, state = "generated", origin = "ai") => ({ id, category, state, origin, prompt: `P ${id}`, answer_outline: "", difficulty: 2, requirement_ids: ["r1"] });
const fresh = (n) => Array.from({ length: n }, (_, i) => ({ prompt: `New ${i}`, answer_outline: "", difficulty: 2, requirement_ids: ["r1"] }));

function state() {
  return {
    kit: {
      questions: [q("q1", "technical"), q("q2", "technical", "edited"), q("q3", "behavioural"), q("q4", "technical", "pinned"), q("q5", "technical"), q("q6", "technical", "edited", "user")],
      schedule: { days_available: 2, days: [{ day: 1, focus: "x", question_ids: ["q1", "q2", "q3"], minutes: 30 }, { day: 2, focus: "y", question_ids: ["q4", "q5"], minutes: 30 }] },
    },
    counters: { q: 9, f: 0 }, // q7–q9 existed once and were deleted
  };
}

test("protected questions stay in their slots; only the category's generated ones are replaced", () => {
  const { state: s, kept, removed, added } = mergeCategory(state(), "technical", fresh(2));
  assert.deepEqual(kept, ["q2", "q4", "q6"]);
  assert.deepEqual(removed, ["q1", "q5"]);
  assert.deepEqual(s.kit.questions.map((x) => x.id), ["q2", "q3", "q4", "q6", "q10", "q11"]);
  assert.deepEqual(added, ["q10", "q11"], "new ids continue after every id ever used");
});

test("other categories are untouched, protected items are unchanged word for word", () => {
  const before = state();
  const { state: s } = mergeCategory(before, "technical", fresh(1));
  for (const id of ["q2", "q3", "q4", "q6"]) {
    assert.deepEqual(s.kit.questions.find((x) => x.id === id), before.kit.questions.find((x) => x.id === id));
  }
});

test("replaced questions leave the schedule and the schedule is flagged stale", () => {
  const { state: s } = mergeCategory(state(), "technical", fresh(1));
  assert.deepEqual(s.kit.schedule.days.map((d) => d.question_ids), [["q2", "q3"], ["q4"]]);
  assert.equal(s.scheduleStale, true);
});

test("new questions are labelled generated and ai, with the category from code", () => {
  const { state: s } = mergeCategory(state(), "system-design", [{ ...fresh(1)[0], category: "technical" }]);
  const added = s.kit.questions.at(-1);
  assert.deepEqual([added.category, added.state, added.origin], ["system-design", "generated", "ai"]);
});

const brief = (fieldState) => ({ company_brief: { summary: "Old S", what_they_do: "Old W", sources: ["a"], ...(fieldState ? { field_state: fieldState } : {}) } });
const freshBrief = { summary: "New S", what_they_do: "New W", sources: ["b"] };

test("brief: generated fields are replaced; edited ones only with confirm; pinned never", () => {
  assert.deepEqual(mergeBrief(brief(), freshBrief).replaced, ["summary", "what_they_do"]);

  const noConfirm = mergeBrief(brief({ summary: "edited", what_they_do: "generated" }), freshBrief);
  assert.equal(noConfirm.kit.company_brief.summary, "Old S");
  assert.equal(noConfirm.kit.company_brief.what_they_do, "New W");

  const confirmed = mergeBrief(brief({ summary: "edited", what_they_do: "pinned" }), freshBrief, { confirm: true });
  assert.equal(confirmed.kit.company_brief.summary, "New S");
  assert.equal(confirmed.kit.company_brief.field_state.summary, "generated");
  assert.equal(confirmed.kit.company_brief.what_they_do, "Old W", "pinned is never replaced, even with confirm");
});
