// Regeneration as a merge (D8 rules 2, 4, 5). Pure functions: given the kit as it
// is when the regeneration finishes, keep every protected item, replace only the
// AI's untouched ones. Called on a fresh read of the document, so edits made while
// the model was working are part of what gets protected.

import { pruneSchedule } from "./ops.js";

export const isProtected = (item) => (item.state ?? "generated") !== "generated";

// state: { kit, counters }; fresh: questions from the model (no ids).
// → { state, kept: [id], removed: [id], added: [id] }
export function mergeCategory(state, category, fresh) {
  const next = structuredClone(state);
  const { kit } = next;
  next.counters ??= { q: 0, f: 0 };
  const kept = [];
  const removed = [];

  // Protected questions keep their slots; the category's generated ones leave.
  kit.questions = kit.questions.filter((q) => {
    if (q.category !== category) return true;
    if (isProtected(q)) return kept.push(q.id), true;
    removed.push(q.id);
    return false;
  });

  const added = fresh.map((q) => ({ ...q, id: `q${++next.counters.q}`, category, state: "generated", origin: "ai" }));
  kit.questions.push(...added);
  pruneSchedule(kit);
  next.scheduleStale = removed.length > 0 || added.length > 0 || Boolean(state.scheduleStale);
  return { state: next, kept, removed, added: added.map((q) => q.id) };
}

const BRIEF_FIELDS = ["summary", "what_they_do"];

// Replaces generated brief fields; edited ones only when the user confirmed;
// pinned ones never. → { kit, replaced: [field] }
export function mergeBrief(kit, fresh, { confirm = false } = {}) {
  const next = structuredClone(kit);
  const brief = next.company_brief;
  brief.field_state ??= { summary: "generated", what_they_do: "generated" };
  const replaced = [];
  for (const field of BRIEF_FIELDS) {
    const state = brief.field_state[field] ?? "generated";
    if (state === "pinned" || (state === "edited" && !confirm)) continue;
    brief[field] = fresh[field];
    brief.field_state[field] = "generated";
    replaced.push(field);
  }
  if (replaced.length > 0) brief.sources = fresh.sources;
  return { kit: next, replaced };
}

export function briefHasEdits(kit) {
  const states = kit.company_brief.field_state ?? {};
  return BRIEF_FIELDS.some((field) => states[field] === "edited");
}
