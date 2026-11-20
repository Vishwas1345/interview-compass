// Schedule allocation (spec step 10). Pure arithmetic: the model never decides it.
//
// 1. Rank questions: those covering a must-have first, then hardest first.
// 2. Study days: deal the ranked list into contiguous, near-equal chunks, so the
//    hardest and highest-priority material lands earliest. With 3+ days and enough
//    questions, the last day is kept for review instead of new material.
// 3. Review days: any days left over revisit must-have questions, hardest first,
//    cycling through them.
// Minutes are whole numbers derived from difficulty (estimates, see README).

export const MINUTES_BY_DIFFICULTY = { 1: 10, 2: 15, 3: 20 };
export const DAILY_REVIEW_MINUTES = 10;
export const REVIEW_QUESTIONS_PER_DAY = 3;
export const EMPTY_DAY_MINUTES = 30;

export function allocateSchedule({ questions, requirements, days }) {
  const requirementsById = new Map(requirements.map((r) => [r.id, r]));
  const isMust = (q) => q.requirement_ids.some((id) => requirementsById.get(id)?.priority === "must");

  const ranked = questions
    .map((q, index) => ({ q, index, must: isMust(q) }))
    .sort((a, b) => Number(b.must) - Number(a.must) || b.q.difficulty - a.q.difficulty || a.index - b.index)
    .map(({ q }) => q);

  let studyDays = Math.min(days, ranked.length);
  if (studyDays === days && days >= 3) studyDays -= 1; // keep the night before light

  const chunks = splitEvenly(ranked, studyDays);
  const reviewPool = ranked.filter(isMust);
  const reviewSource = reviewPool.length > 0 ? reviewPool : ranked;

  const schedule = [];
  for (let day = 1; day <= days; day += 1) {
    if (day <= studyDays) {
      const dayQuestions = chunks[day - 1];
      schedule.push(buildDay(day, "study", dayQuestions, requirementsById));
    } else {
      const offset = (day - studyDays - 1) * REVIEW_QUESTIONS_PER_DAY;
      const dayQuestions = takeCyclic(reviewSource, offset, REVIEW_QUESTIONS_PER_DAY);
      schedule.push(buildDay(day, "review", dayQuestions, requirementsById));
    }
  }

  return { days_available: days, days: schedule };
}

// Contiguous chunks whose sizes differ by at most one; earlier chunks get the extra.
function splitEvenly(items, parts) {
  const chunks = [];
  const base = Math.floor(items.length / Math.max(parts, 1));
  let extra = items.length % Math.max(parts, 1);
  let start = 0;
  for (let i = 0; i < parts; i += 1) {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    chunks.push(items.slice(start, start + size));
    start += size;
  }
  return chunks;
}

function takeCyclic(items, offset, count) {
  if (items.length === 0) return [];
  const picked = [];
  for (let i = 0; i < Math.min(count, items.length); i += 1) {
    picked.push(items[(offset + i) % items.length]);
  }
  return picked;
}

function buildDay(day, kind, dayQuestions, requirementsById) {
  const minutes =
    dayQuestions.length === 0
      ? EMPTY_DAY_MINUTES
      : dayQuestions.reduce((sum, q) => sum + MINUTES_BY_DIFFICULTY[q.difficulty], 0) + DAILY_REVIEW_MINUTES;

  return {
    day,
    focus: describeFocus(kind, dayQuestions, requirementsById),
    question_ids: dayQuestions.map((q) => q.id),
    minutes,
    kind, // additive field: "study" introduces material, "review" revisits it
  };
}

// The focus names the requirements the day's questions cover, must-haves first;
// questions tied to no requirement fall back to their category.
function describeFocus(kind, dayQuestions, requirementsById) {
  if (dayQuestions.length === 0) return "Company research and role review";

  const topics = [];
  for (const q of dayQuestions) {
    for (const id of q.requirement_ids) {
      const requirement = requirementsById.get(id);
      if (requirement && !topics.includes(requirement.text)) topics.push(requirement.text);
    }
  }
  if (topics.length === 0) {
    for (const q of dayQuestions) {
      const label = `${q.category} questions`;
      if (!topics.includes(label)) topics.push(label);
    }
  }

  const shown = topics.slice(0, 2).join(" · ");
  const more = topics.length > 2 ? ` (+${topics.length - 2} more)` : "";
  return kind === "review" ? `Review: ${shown}${more}` : `${shown}${more}`;
}
