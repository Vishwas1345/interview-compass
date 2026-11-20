// Builder operations (app spec: The builder; D8). applyOp is pure: it takes the
// editable parts of a kit document and one operation, and returns new parts or
// throws INVALID_OP. Every D8 rule lives here, so the route only loads, applies,
// validates and saves.
//
// state: { kit, counters: { q, f }, dismissed: { [category]: [prompt] }, scheduleStale }

import { z } from "zod";
import { QUESTION_CATEGORIES, DAYS_MIN, DAYS_MAX } from "@interview-compass/shared";
import { HttpError } from "../utils/http-error.js";
import { allocateSchedule } from "../pipeline/schedule/allocate.js";
import { findUncovered } from "../pipeline/coverage/coverage.js";

export const TEXT_MAX = 2000; // question prompt, answer outline, brief field
export const CARD_TEXT_MAX = 500; // each flashcard side
const DISMISSED_MAX = 50; // per category; the oldest are forgotten first

const id = z.string().min(1).max(20);
const requirementIds = z.array(id).max(20);
const category = z.enum(QUESTION_CATEGORIES);
const difficulty = z.int().min(1).max(3);
const prompt = z.string().trim().min(1, "The question cannot be empty.").max(TEXT_MAX);
const outline = z.string().trim().max(TEXT_MAX);
const cardSide = z.string().trim().min(1, "A flashcard side cannot be empty.").max(CARD_TEXT_MAX);
const briefField = z.string().trim().max(TEXT_MAX);

export const opSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("updateQuestion"), id, fields: z.object({ prompt, answer_outline: outline, difficulty, requirement_ids: requirementIds }).partial() }),
  z.object({ type: z.literal("updateFlashcard"), id, fields: z.object({ front: cardSide, back: cardSide, requirement_ids: requirementIds }).partial() }),
  z.object({ type: z.literal("updateBrief"), fields: z.object({ summary: briefField, what_they_do: briefField }).partial() }),
  z.object({ type: z.literal("addQuestion"), question: z.object({ category, prompt, answer_outline: outline.default(""), difficulty: difficulty.default(2), requirement_ids: requirementIds.default([]) }) }),
  z.object({ type: z.literal("addFlashcard"), flashcard: z.object({ front: cardSide, back: cardSide, requirement_ids: requirementIds.default([]) }) }),
  z.object({ type: z.literal("deleteQuestion"), id }),
  z.object({ type: z.literal("deleteFlashcard"), id }),
  z.object({ type: z.literal("setPinned"), target: z.enum(["question", "flashcard", "brief"]), id: id.optional(), field: z.enum(["summary", "what_they_do"]).optional(), pinned: z.boolean() }),
  z.object({ type: z.literal("moveQuestion"), id, category }),
  z.object({ type: z.literal("reorder"), kind: z.enum(["questions", "flashcards"]), category: category.optional(), ids: z.array(id).max(500) }),
  z.object({ type: z.literal("setDays"), days: z.int().min(DAYS_MIN).max(DAYS_MAX) }),
  z.object({ type: z.literal("rebuildSchedule") }),
]);

const invalid = (message) => new HttpError(400, "INVALID_OP", message);
const BRIEF_FIELDS = ["summary", "what_they_do"];

export function applyOp(state, rawOp) {
  const op = opSchema.parse(rawOp);
  const next = structuredClone(state);
  const { kit } = next;
  next.dismissed ??= {};
  next.counters ??= { q: 0, f: 0 };
  const requirementSet = new Set(kit.role.requirements.map((r) => r.id));
  const checkRequirements = (ids = []) => {
    const unknown = ids.find((r) => !requirementSet.has(r));
    if (unknown) throw invalid(`Unknown requirement "${unknown}".`);
    return [...new Set(ids)];
  };
  const findQuestion = (qid) => kit.questions.find((q) => q.id === qid) ?? throwInvalid(`No question "${qid}".`);
  const findCard = (fid) => kit.flashcards.find((f) => f.id === fid) ?? throwInvalid(`No flashcard "${fid}".`);

  switch (op.type) {
    case "updateQuestion":
    case "updateFlashcard": {
      const item = op.type === "updateQuestion" ? findQuestion(op.id) : findCard(op.id);
      const fields = { ...op.fields };
      if (fields.requirement_ids) fields.requirement_ids = checkRequirements(fields.requirement_ids);
      if (Object.entries(fields).some(([k, v]) => JSON.stringify(item[k]) !== JSON.stringify(v))) {
        Object.assign(item, fields);
        markEdited(item);
      }
      break;
    }
    case "updateBrief": {
      const brief = kit.company_brief;
      brief.field_state ??= { summary: "generated", what_they_do: "generated" };
      for (const field of BRIEF_FIELDS) {
        if (op.fields[field] === undefined || op.fields[field] === brief[field]) continue;
        brief[field] = op.fields[field];
        if (brief.field_state[field] === "pinned") (brief.field_state_before_pin ??= {})[field] = "edited";
        else brief.field_state[field] = "edited";
      }
      break;
    }
    case "addQuestion": {
      const q = op.question;
      kit.questions.push({
        id: `q${++next.counters.q}`,
        requirement_ids: checkRequirements(q.requirement_ids),
        category: q.category,
        prompt: q.prompt,
        answer_outline: q.answer_outline,
        difficulty: q.difficulty,
        state: "edited",
        origin: "user",
      });
      next.scheduleStale = true;
      break;
    }
    case "addFlashcard": {
      const f = op.flashcard;
      kit.flashcards.push({ id: `f${++next.counters.f}`, front: f.front, back: f.back, requirement_ids: checkRequirements(f.requirement_ids), state: "edited", origin: "user" });
      break;
    }
    case "deleteQuestion": {
      const q = findQuestion(op.id);
      kit.questions = kit.questions.filter((x) => x.id !== op.id);
      // A deleted AI question is remembered so regeneration does not suggest it again (D8 rule 3).
      if ((q.origin ?? "ai") === "ai") {
        const list = (next.dismissed[q.category] ??= []);
        if (!list.includes(q.prompt)) list.push(q.prompt);
        next.dismissed[q.category] = list.slice(-DISMISSED_MAX);
      }
      pruneSchedule(kit);
      next.scheduleStale = true;
      break;
    }
    case "deleteFlashcard":
      findCard(op.id);
      kit.flashcards = kit.flashcards.filter((x) => x.id !== op.id);
      break;
    case "setPinned": {
      if (op.target === "brief") {
        if (!op.field) throw invalid("Say which brief field to pin.");
        const brief = kit.company_brief;
        brief.field_state ??= { summary: "generated", what_they_do: "generated" };
        brief.field_state_before_pin ??= {};
        if (op.pinned && brief.field_state[op.field] !== "pinned") {
          brief.field_state_before_pin[op.field] = brief.field_state[op.field];
          brief.field_state[op.field] = "pinned";
        } else if (!op.pinned && brief.field_state[op.field] === "pinned") {
          brief.field_state[op.field] = brief.field_state_before_pin[op.field] ?? "edited";
        }
        break;
      }
      if (!op.id) throw invalid("Say which item to pin.");
      setPinned(op.target === "question" ? findQuestion(op.id) : findCard(op.id), op.pinned);
      break;
    }
    case "moveQuestion": {
      const q = findQuestion(op.id);
      if (q.category === op.category) break;
      q.category = op.category;
      markEdited(q); // a deliberate placement: protect it from the new category's regeneration
      kit.questions = [...kit.questions.filter((x) => x.id !== q.id), q]; // last in its new category
      next.scheduleStale = true;
      break;
    }
    case "reorder": {
      if (op.kind === "flashcards") {
        assertPermutation(op.ids, kit.flashcards.map((f) => f.id));
        const byId = new Map(kit.flashcards.map((f) => [f.id, f]));
        kit.flashcards = op.ids.map((fid) => byId.get(fid));
        break;
      }
      if (!op.category) throw invalid("Say which category to reorder.");
      const inCategory = kit.questions.filter((q) => q.category === op.category);
      assertPermutation(op.ids, inCategory.map((q) => q.id));
      // The category's slots in the flat list keep their positions; only their contents change.
      const byId = new Map(inCategory.map((q) => [q.id, q]));
      const order = op.ids.map((qid) => byId.get(qid));
      let i = 0;
      kit.questions = kit.questions.map((q) => (q.category === op.category ? order[i++] : q));
      break;
    }
    case "setDays":
    case "rebuildSchedule": {
      const days = op.type === "setDays" ? op.days : kit.schedule.days_available;
      kit.schedule = allocateSchedule({ questions: kit.questions, requirements: kit.role.requirements, days });
      next.scheduleStale = false;
      break;
    }
  }

  // The recorded coverage always tells the truth about the kit as it now is.
  kit.coverage.uncovered_requirement_ids = findUncovered(kit.role.requirements, kit.questions).map((r) => r.id);
  return next;
}

function throwInvalid(message) {
  throw invalid(message);
}

function markEdited(item) {
  if ((item.state ?? "generated") === "generated") item.state = "edited";
  // Edited while pinned: unpinning must not make the user's text replaceable again.
  else if (item.state === "pinned") item.state_before_pin = "edited";
}

function setPinned(item, pinned) {
  if (pinned && item.state !== "pinned") {
    item.state_before_pin = item.state ?? "generated";
    item.state = "pinned";
  } else if (!pinned && item.state === "pinned") {
    item.state = item.state_before_pin ?? "edited";
    delete item.state_before_pin;
  }
}

function assertPermutation(ids, current) {
  const a = [...ids].sort();
  const b = [...current].sort();
  if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
    throw invalid("The new order must list exactly the current items, each once.");
  }
}

// Questions removed from the kit leave the schedule at once (spec); the schedule is
// then marked stale until rebuilt.
export function pruneSchedule(kit) {
  const present = new Set(kit.questions.map((q) => q.id));
  for (const day of kit.schedule.days) day.question_ids = day.question_ids.filter((qid) => present.has(qid));
}
