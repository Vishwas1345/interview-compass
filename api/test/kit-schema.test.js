import { test } from "node:test";
import assert from "node:assert/strict";
import { validateKit } from "@interview-compass/shared";

// A minimal kit in the exact Appendix A shape. Each test breaks one thing.
function validKit() {
  return {
    source: {
      company: "Acme",
      company_url: "http://localhost:8099/acme/",
      role: "Senior Backend Engineer",
      location: "Remote",
      jd_chars: 1200,
      researched_at: "2026-11-20T10:00:00Z",
      pages_used: ["http://localhost:8099/acme/"],
    },
    company_brief: { summary: "Acme builds rockets.", what_they_do: "Rockets.", sources: ["http://localhost:8099/acme/"] },
    role: {
      title: "Senior Backend Engineer",
      seniority: "senior",
      responsibilities: ["Build APIs"],
      requirements: [
        { id: "r1", text: "5+ years with Node.js", kind: "technical", priority: "must" },
        { id: "r2", text: "Mentoring juniors", kind: "behavioural", priority: "nice" },
      ],
    },
    questions: [
      { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "Explain the event loop.", answer_outline: "Phases…", difficulty: 2 },
      { id: "q2", requirement_ids: ["r2"], category: "behavioural", prompt: "Tell me about mentoring.", answer_outline: "STAR…", difficulty: 1 },
    ],
    flashcards: [{ id: "f1", front: "Event loop phases?", back: "Timers, poll, check…", requirement_ids: ["r1"] }],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: "Node.js", question_ids: ["q1"], minutes: 25 },
        { day: 2, focus: "Mentoring", question_ids: ["q2"], minutes: 20 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

function expectInvalid(kit, pathFragment, options) {
  const result = validateKit(kit, options);
  assert.equal(result.ok, false, "kit should be rejected");
  assert.ok(
    result.errors.some((e) => e.path.includes(pathFragment)),
    `expected an error at "${pathFragment}", got ${JSON.stringify(result.errors)}`,
  );
}

test("a kit in the exact Appendix A shape passes", () => {
  assert.deepEqual(validateKit(validKit(), { daysRequested: 2 }), { ok: true, errors: [], warnings: [] });
});

test("extra fields (D8 additive extensions) are allowed", () => {
  const kit = validKit();
  kit.questions[0].state = "edited";
  kit.questions[0].origin = "user";
  kit.research = { hiring_page_found: false };
  assert.equal(validateKit(kit).ok, true);
});

test("a renamed field is rejected (catches typos like requirementIds)", () => {
  const kit = validKit();
  kit.questions[0].requirementIds = kit.questions[0].requirement_ids;
  delete kit.questions[0].requirement_ids;
  expectInvalid(kit, "questions.0.requirement_ids");
});

test("a missing top-level section is rejected", () => {
  const kit = validKit();
  delete kit.coverage;
  expectInvalid(kit, "coverage");
});

test("fractional minutes are rejected", () => {
  const kit = validKit();
  kit.schedule.days[0].minutes = 22.5;
  expectInvalid(kit, "schedule.days.0.minutes");
});

test("difficulty outside 1-3 is rejected", () => {
  const kit = validKit();
  kit.questions[0].difficulty = 4;
  expectInvalid(kit, "questions.0.difficulty");
});

test("an unknown category or priority is rejected", () => {
  const kit = validKit();
  kit.questions[0].category = "coding";
  kit.role.requirements[0].priority = "required";
  expectInvalid(kit, "questions.0.category");
  expectInvalid(kit, "role.requirements.0.priority");
});

test("a question pointing at a missing requirement is rejected", () => {
  const kit = validKit();
  kit.questions[0].requirement_ids = ["r9"];
  expectInvalid(kit, "questions.0.requirement_ids.0");
});

test("a schedule pointing at a missing question is rejected", () => {
  const kit = validKit();
  kit.schedule.days[1].question_ids = ["q9"];
  expectInvalid(kit, "schedule.days.1.question_ids.0");
});

test("duplicate ids are rejected", () => {
  const kit = validKit();
  kit.questions[1].id = "q1";
  expectInvalid(kit, "questions.1.id");
});

test("a day count different from the request is rejected", () => {
  expectInvalid(validKit(), "schedule.days_available", { daysRequested: 5 });
});

test("days_available disagreeing with the days list is rejected", () => {
  const kit = validKit();
  kit.schedule.days.pop();
  expectInvalid(kit, "schedule.days");
});

test("days out of order are rejected", () => {
  const kit = validKit();
  kit.schedule.days.reverse();
  expectInvalid(kit, "schedule.days.0.day");
});

test("an uncovered must-have requirement is rejected", () => {
  const kit = validKit();
  kit.coverage.uncovered_requirement_ids = ["r1"];
  expectInvalid(kit, "coverage.uncovered_requirement_ids");
});

test("a must-have requirement missing from the schedule is rejected", () => {
  const kit = validKit();
  kit.schedule.days[0].question_ids = [];
  expectInvalid(kit, "schedule.days");
});

test("an uncovered nice-to-have is allowed", () => {
  const kit = validKit();
  kit.coverage.uncovered_requirement_ids = ["r2"];
  assert.equal(validateKit(kit).ok, true);
});

test("a kit with no requirements at all (thin posting) is valid", () => {
  const kit = validKit();
  kit.role.requirements = [];
  kit.questions = kit.questions.map((q) => ({ ...q, requirement_ids: [] }));
  kit.flashcards = [];
  assert.equal(validateKit(kit).ok, true);
});

test("never throws on garbage input", () => {
  assert.equal(validateKit(null).ok, false);
  assert.equal(validateKit("kit").ok, false);
});

// --- warn mode (kits the user has edited) -------------------------------------

test("warn mode: a must-have with no question is a warning, not an error", () => {
  const kit = validKit();
  kit.questions = kit.questions.filter((q) => q.id !== "q1"); // the user deleted the only r1 question
  kit.schedule.days[0].question_ids = [];
  expectInvalid(structuredClone(kit), "coverage.uncovered_requirement_ids"); // strict still refuses
  const result = validateKit(kit, { coverage: "warn" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings.map((w) => [w.code, w.requirement_id]), [["MUST_UNCOVERED", "r1"]]);
});

test("warn mode: a covered but unscheduled must-have is a warning", () => {
  const kit = validKit();
  kit.schedule.days[0].question_ids = [];
  const result = validateKit(kit, { coverage: "warn" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings.map((w) => w.code), ["MUST_UNSCHEDULED"]);
});

test("warn mode still rejects broken structure and references", () => {
  const kit = validKit();
  kit.questions[0].requirement_ids = ["r9"];
  expectInvalid(kit, "questions.0.requirement_ids", { coverage: "warn" });
});
