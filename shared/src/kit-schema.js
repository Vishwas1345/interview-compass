// The kit contract (brief Appendix A). Field names are exact; extra fields are
// allowed (the brief permits additive extensions, D8), so objects are "loose":
// unknown keys pass through instead of being stripped.

import { z } from "zod";

export const REQUIREMENT_KINDS = ["technical", "behavioural", "domain"];
export const REQUIREMENT_PRIORITIES = ["must", "nice"];
export const QUESTION_CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"];
export const ITEM_STATES = ["generated", "edited", "pinned"];
export const ITEM_ORIGINS = ["ai", "user"];
export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 3;
export const DAYS_MIN = 1;
export const DAYS_MAX = 365;

const id = z.string().min(1);
const ids = z.array(id);

// Additive per-item fields from D8; optional so a bare Appendix A kit still validates.
const itemMeta = {
  state: z.enum(ITEM_STATES).optional(),
  origin: z.enum(ITEM_ORIGINS).optional(),
};

const requirementSchema = z.looseObject({
  id,
  text: z.string().min(1),
  kind: z.enum(REQUIREMENT_KINDS),
  priority: z.enum(REQUIREMENT_PRIORITIES),
});

const questionSchema = z.looseObject({
  id,
  requirement_ids: ids,
  category: z.enum(QUESTION_CATEGORIES),
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: z.int().min(DIFFICULTY_MIN).max(DIFFICULTY_MAX),
  ...itemMeta,
});

const flashcardSchema = z.looseObject({
  id,
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: ids,
  ...itemMeta,
});

const scheduleDaySchema = z.looseObject({
  day: z.int().min(1),
  focus: z.string().min(1),
  question_ids: ids,
  minutes: z.int().min(1),
});

export const kitSchema = z.looseObject({
  source: z.looseObject({
    company: z.string(),
    company_url: z.string(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.int().min(0),
    researched_at: z.string(),
    pages_used: z.array(z.string()),
  }),
  company_brief: z.looseObject({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string()),
  }),
  role: z.looseObject({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(requirementSchema),
  }),
  questions: z.array(questionSchema),
  flashcards: z.array(flashcardSchema),
  schedule: z.looseObject({
    days_available: z.int().min(DAYS_MIN).max(DAYS_MAX),
    days: z.array(scheduleDaySchema),
  }),
  coverage: z.looseObject({
    uncovered_requirement_ids: ids,
    passes: z.int().min(0),
  }),
});

// Checks the shape, then the rules a schema cannot express: unique ids, every
// reference pointing at something that exists, the exact day count, and no
// must-have requirement left uncovered or unscheduled.
// Returns { ok, errors: [{ path, message }] } and never throws.
// coverage: "strict" (default) or "warn" — see the coverage rules at the end.
export function validateKit(kit, { daysRequested, coverage = "strict" } = {}) {
  const parsed = kitSchema.safeParse(kit);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      warnings: [],
    };
  }

  const errors = [];
  const fail = (path, message) => errors.push({ path, message });

  const requirementIds = collectIds(kit.role.requirements, "role.requirements", fail);
  const questionIds = collectIds(kit.questions, "questions", fail);
  collectIds(kit.flashcards, "flashcards", fail);

  checkRefs(kit.questions, "questions", "requirement_ids", requirementIds, fail);
  checkRefs(kit.flashcards, "flashcards", "requirement_ids", requirementIds, fail);
  checkRefs(kit.schedule.days, "schedule.days", "question_ids", questionIds, fail);

  const { days, days_available: daysAvailable } = kit.schedule;
  if (daysRequested !== undefined && daysAvailable !== daysRequested) {
    fail("schedule.days_available", `expected ${daysRequested} days, got ${daysAvailable}`);
  }
  if (days.length !== daysAvailable) {
    fail("schedule.days", `expected ${daysAvailable} days, got ${days.length}`);
  }
  days.forEach((entry, index) => {
    if (entry.day !== index + 1) {
      fail(`schedule.days.${index}.day`, `expected day ${index + 1}, got ${entry.day}`);
    }
  });

  const musts = kit.role.requirements.filter((r) => r.priority === "must");
  const uncovered = new Set(kit.coverage.uncovered_requirement_ids);
  kit.coverage.uncovered_requirement_ids.forEach((reqId, index) => {
    if (!requirementIds.has(reqId)) {
      fail(`coverage.uncovered_requirement_ids.${index}`, `unknown requirement "${reqId}"`);
    }
  });

  const questionsById = new Map(kit.questions.map((q) => [q.id, q]));
  const scheduledRequirementIds = new Set(
    days.flatMap((d) => d.question_ids).flatMap((qId) => questionsById.get(qId)?.requirement_ids ?? []),
  );
  // Strict (generated kits): an uncovered or unscheduled must-have is an error.
  // Warn (kits the user has edited): it is a warning the builder shows with a fix,
  // because a user may delete the only question for a requirement (app spec).
  const warnings = [];
  const coverageIssue = (path, message, code, requirementId) =>
    coverage === "warn" ? warnings.push({ path, message, code, requirement_id: requirementId }) : fail(path, message);
  const coveredByQuestions = new Set(kit.questions.flatMap((q) => q.requirement_ids));
  for (const must of musts) {
    if (uncovered.has(must.id) || !coveredByQuestions.has(must.id)) {
      coverageIssue("coverage.uncovered_requirement_ids", `must-have requirement "${must.id}" is uncovered`, "MUST_UNCOVERED", must.id);
    } else if (!scheduledRequirementIds.has(must.id)) {
      coverageIssue("schedule.days", `must-have requirement "${must.id}" does not appear in the schedule`, "MUST_UNSCHEDULED", must.id);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function collectIds(items, path, fail) {
  const seen = new Set();
  items.forEach((item, index) => {
    if (seen.has(item.id)) fail(`${path}.${index}.id`, `duplicate id "${item.id}"`);
    seen.add(item.id);
  });
  return seen;
}

function checkRefs(items, path, field, validIds, fail) {
  items.forEach((item, index) => {
    item[field].forEach((ref, refIndex) => {
      if (!validIds.has(ref)) fail(`${path}.${index}.${field}.${refIndex}`, `unknown id "${ref}"`);
    });
  });
}
