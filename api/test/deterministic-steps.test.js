// The three deterministic pieces must agree with each other: whatever the gap
// loop and the scheduler produce has to pass the kit validator.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateKit } from "@interview-compass/shared";
import { closeGaps } from "../src/pipeline/coverage/coverage.js";
import { allocateSchedule } from "../src/pipeline/schedule/allocate.js";

const requirements = [
  { id: "r1", text: "Node.js", kind: "technical", priority: "must" },
  { id: "r2", text: "Mentoring", kind: "behavioural", priority: "must" },
  { id: "r3", text: "Kubernetes", kind: "technical", priority: "nice" },
];

function kitFrom({ questions, coverage, schedule }) {
  return {
    source: { company: "Acme", company_url: "http://localhost:8099/acme/", role: "Engineer", location: "",
      jd_chars: 100, researched_at: "2026-11-20T10:00:00Z", pages_used: [] },
    company_brief: { summary: "", what_they_do: "", sources: [] },
    role: { title: "Engineer", seniority: "", responsibilities: [], requirements },
    questions,
    flashcards: [],
    schedule,
    coverage,
  };
}

for (const days of [1, 5, 60]) {
  test(`gap loop + fallbacks + ${days}-day schedule produce a valid kit`, async () => {
    const draft = [{ id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Event loop?", answer_outline: "", difficulty: 3 }];
    const covered = await closeGaps({ requirements, questions: draft, generateForGaps: async () => [] });
    const schedule = allocateSchedule({ questions: covered.questions, requirements, days });
    const kit = kitFrom({
      questions: covered.questions,
      coverage: { uncovered_requirement_ids: covered.uncovered_requirement_ids, passes: covered.passes },
      schedule,
    });
    assert.deepEqual(validateKit(kit, { daysRequested: days }), { ok: true, errors: [] });
  });
}
