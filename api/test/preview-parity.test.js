// The web app previews each builder operation before the server answers
// (web/src/lib/local-ops.js). If the preview and the server's applyOp disagree,
// the screen jumps when the reply lands: this test keeps them identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOp } from "../src/kits/ops.js";
import { localApply } from "../../web/src/lib/local-ops.js";
import { allocateSchedule } from "../src/pipeline/schedule/allocate.js";

const requirements = [
  { id: "r1", text: "Node.js", kind: "technical", priority: "must" },
  { id: "r2", text: "Mentoring", kind: "behavioural", priority: "must" },
];
const q = (id, category, reqs) => ({ id, category, requirement_ids: reqs, prompt: `P ${id}`, answer_outline: "", difficulty: 2, state: "generated", origin: "ai" });
const questions = [q("q1", "technical", ["r1"]), q("q2", "technical", ["r1"]), q("q3", "behavioural", ["r2"]), q("q4", "technical", ["r1"]), q("q5", "company-fit", [])];
const kit = {
  source: {}, role: { requirements },
  company_brief: { summary: "S", what_they_do: "W", sources: [] },
  questions,
  flashcards: ["f1", "f2", "f3"].map((id) => ({ id, front: id, back: id, requirement_ids: [], state: "generated", origin: "ai" })),
  schedule: allocateSchedule({ questions, requirements, days: 3 }),
  coverage: { uncovered_requirement_ids: [], passes: 1 },
};

const OPS = [
  { type: "updateQuestion", id: "q1", fields: { prompt: "P q1" } }, // unchanged text: stays generated
  { type: "updateQuestion", id: "q1", fields: { prompt: "Edited" } },
  { type: "setPinned", target: "question", id: "q2", pinned: true },
  { type: "updateQuestion", id: "q2", fields: { prompt: "Edited while pinned" } },
  { type: "setPinned", target: "question", id: "q2", pinned: false },
  { type: "setPinned", target: "question", id: "q4", pinned: true },
  { type: "setPinned", target: "question", id: "q4", pinned: false },
  { type: "reorder", kind: "questions", category: "technical", ids: ["q4", "q2", "q1"] },
  { type: "moveQuestion", id: "q4", category: "company-fit" },
  { type: "deleteQuestion", id: "q3" },
  { type: "updateFlashcard", id: "f1", fields: { back: "New" } },
  { type: "setPinned", target: "flashcard", id: "f2", pinned: true },
  { type: "reorder", kind: "flashcards", ids: ["f3", "f2", "f1"] },
  { type: "deleteFlashcard", id: "f2" },
  { type: "updateBrief", fields: { summary: "Mine" } },
  { type: "setPinned", target: "brief", field: "what_they_do", pinned: true },
  { type: "updateBrief", fields: { what_they_do: "Mine too" } },
  { type: "setPinned", target: "brief", field: "what_they_do", pinned: false },
];

const visible = (k) => ({
  questions: k.questions.map((x) => ({ id: x.id, category: x.category, state: x.state ?? "generated", prompt: x.prompt })),
  flashcards: k.flashcards.map((f) => ({ id: f.id, state: f.state ?? "generated", back: f.back })),
  brief: [k.company_brief.summary, k.company_brief.what_they_do, { summary: "generated", what_they_do: "generated", ...k.company_brief.field_state }],
  schedule: k.schedule.days.map((d) => d.question_ids),
});

test("every previewed builder operation matches what the server saves, step by step", () => {
  let server = { kit: structuredClone(kit), counters: { q: 5, f: 3 }, dismissed: {}, scheduleStale: false };
  let preview = { kit: structuredClone(kit), scheduleStale: false };
  for (const op of OPS) {
    server = applyOp(server, op);
    preview = localApply(preview, op);
    assert.deepEqual(visible(preview.kit), visible(server.kit), `after ${op.type} ${op.id ?? op.field ?? op.kind ?? ""}`);
    assert.equal(Boolean(preview.scheduleStale), Boolean(server.scheduleStale), `scheduleStale after ${op.type}`);
  }
});
