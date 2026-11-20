import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateSchedule, MINUTES_BY_DIFFICULTY, DAILY_REVIEW_MINUTES } from "../src/pipeline/schedule/allocate.js";

const requirements = [
  { id: "r1", text: "Node.js", priority: "must" },
  { id: "r2", text: "PostgreSQL", priority: "must" },
  { id: "r3", text: "Mentoring", priority: "nice" },
  { id: "r4", text: "Kubernetes", priority: "nice" },
];

// 10 questions with mixed difficulty and priority, deliberately not pre-sorted.
const questions = [
  { id: "q1", requirement_ids: ["r3"], category: "behavioural", difficulty: 1 },
  { id: "q2", requirement_ids: ["r1"], category: "technical", difficulty: 2 },
  { id: "q3", requirement_ids: ["r4"], category: "technical", difficulty: 3 },
  { id: "q4", requirement_ids: ["r2"], category: "technical", difficulty: 3 },
  { id: "q5", requirement_ids: ["r1"], category: "system-design", difficulty: 3 },
  { id: "q6", requirement_ids: [], category: "company-fit", difficulty: 1 },
  { id: "q7", requirement_ids: ["r2"], category: "technical", difficulty: 1 },
  { id: "q8", requirement_ids: ["r3"], category: "behavioural", difficulty: 2 },
  { id: "q9", requirement_ids: ["r1", "r2"], category: "technical", difficulty: 2 },
  { id: "q10", requirement_ids: ["r4"], category: "technical", difficulty: 2 },
];

const allocate = (days, qs = questions) => allocateSchedule({ questions: qs, requirements, days });

for (const days of [1, 2, 5, 60, 365]) {
  test(`${days}-day request gives exactly ${days} days, numbered 1..${days}`, () => {
    const schedule = allocate(days);
    assert.equal(schedule.days_available, days);
    assert.equal(schedule.days.length, days);
    schedule.days.forEach((d, i) => assert.equal(d.day, i + 1));
  });

  test(`${days}-day schedule: whole, positive minutes and a focus every day`, () => {
    for (const d of allocate(days).days) {
      assert.ok(Number.isInteger(d.minutes) && d.minutes > 0, `day ${d.day} minutes ${d.minutes}`);
      assert.ok(d.focus.length > 0);
    }
  });

  test(`${days}-day schedule: every question is introduced and every must-have appears`, () => {
    const scheduled = new Set(allocate(days).days.flatMap((d) => d.question_ids));
    for (const q of questions) assert.ok(scheduled.has(q.id), `${q.id} missing`);
    const coveredReqs = new Set(questions.filter((q) => scheduled.has(q.id)).flatMap((q) => q.requirement_ids));
    for (const r of requirements.filter((r) => r.priority === "must")) assert.ok(coveredReqs.has(r.id));
  });
}

test("schedule only references questions that exist", () => {
  const known = new Set(questions.map((q) => q.id));
  for (const d of allocate(60).days) for (const id of d.question_ids) assert.ok(known.has(id));
});

test("no question is introduced twice on study days", () => {
  const studied = allocate(5).days.filter((d) => d.kind === "study").flatMap((d) => d.question_ids);
  assert.equal(new Set(studied).size, studied.length);
});

test("a one-day schedule puts everything on day one", () => {
  const [day] = allocate(1).days;
  assert.equal(day.question_ids.length, questions.length);
});

test("must-have questions are introduced before nice-to-have ones", () => {
  const firstDay = new Map();
  for (const d of allocate(5).days) for (const id of d.question_ids) if (!firstDay.has(id)) firstDay.set(id, d.day);
  const mustIds = ["q2", "q4", "q5", "q7", "q9"];
  const latestMust = Math.max(...mustIds.map((id) => firstDay.get(id)));
  const earliestOther = Math.min(...questions.filter((q) => !mustIds.includes(q.id)).map((q) => firstDay.get(q.id)));
  assert.ok(latestMust <= earliestOther, `must-haves end on day ${latestMust}, others start on day ${earliestOther}`);
});

test("new material is harder in the first half than the second half", () => {
  for (const days of [4, 5, 8]) {
    const firstDay = new Map();
    for (const d of allocate(days).days) for (const id of d.question_ids) if (!firstDay.has(id)) firstDay.set(id, d.day);
    const half = days / 2;
    const mean = (list) => list.reduce((s, q) => s + q.difficulty, 0) / list.length;
    const early = questions.filter((q) => firstDay.get(q.id) <= half);
    const late = questions.filter((q) => firstDay.get(q.id) > half);
    if (late.length > 0) assert.ok(mean(early) >= mean(late), `${days} days: ${mean(early)} < ${mean(late)}`);
  }
});

test("with three or more days, the last day is review, not new material", () => {
  const last = allocate(5).days.at(-1);
  assert.equal(last.kind, "review");
  assert.ok(last.focus.startsWith("Review:"));
});

test("surplus days revisit must-have questions only", () => {
  const mustIds = new Set(["q2", "q4", "q5", "q7", "q9"]);
  for (const d of allocate(60).days.filter((d) => d.kind === "review")) {
    assert.ok(d.question_ids.length > 0);
    for (const id of d.question_ids) assert.ok(mustIds.has(id), `${id} is not a must-have question`);
  }
});

test("minutes are the sum of question minutes plus the daily review block", () => {
  const [day] = allocate(1).days;
  const expected = questions.reduce((s, q) => s + MINUTES_BY_DIFFICULTY[q.difficulty], 0) + DAILY_REVIEW_MINUTES;
  assert.equal(day.minutes, expected);
});

test("no questions at all (thin posting) still gives the requested days", () => {
  const schedule = allocate(5, []);
  assert.equal(schedule.days.length, 5);
  for (const d of schedule.days) {
    assert.deepEqual(d.question_ids, []);
    assert.ok(Number.isInteger(d.minutes) && d.minutes > 0);
  }
});

test("questions with no requirement use their category as the focus", () => {
  const schedule = allocateSchedule({
    questions: [{ id: "q1", requirement_ids: [], category: "company-fit", difficulty: 1 }],
    requirements: [],
    days: 1,
  });
  assert.equal(schedule.days[0].focus, "company-fit questions");
});
