// Coverage check and gap loop (spec step 8). The decision of what is covered is
// made here, in code; the model is only asked to write questions for the gaps.
//
// Loop: check → if gaps, ask for questions for exactly those requirements → check
// again, up to MAX_COVERAGE_CHECKS checks (the first draft plus two gap passes).
// Any must-have still uncovered then gets a plain, marked fallback question, so a
// kit never ships with an uncovered must-have.

export const MAX_COVERAGE_CHECKS = 3;

// Requirements no question points at. References to unknown ids count for nothing.
export function findUncovered(requirements, questions) {
  const covered = new Set(questions.flatMap((q) => q.requirement_ids));
  return requirements.filter((r) => !covered.has(r.id));
}

// generateForGaps(uncoveredRequirements, { pass }) → Promise<question[]> (without ids).
// makeId() → a new, never-used question id.
// Returns { questions, uncovered_requirement_ids, passes, log }.
export async function closeGaps({
  requirements,
  questions,
  generateForGaps,
  makeId = sequentialIdMaker(questions),
  maxChecks = MAX_COVERAGE_CHECKS,
}) {
  const knownIds = new Set(requirements.map((r) => r.id));
  let current = [...questions];
  const log = [];
  let checks = 0;

  while (true) {
    checks += 1;
    const uncovered = findUncovered(requirements, current);
    const entry = { check: checks, uncovered_requirement_ids: uncovered.map((r) => r.id), added: 0 };
    log.push(entry);
    if (uncovered.length === 0 || checks >= maxChecks) break;

    try {
      const generated = await generateForGaps(uncovered, { pass: checks });
      const usable = generated
        .map((q) => ({ ...q, requirement_ids: q.requirement_ids.filter((id) => knownIds.has(id)) }))
        .filter((q) => q.requirement_ids.length > 0)
        .map((q) => ({ ...q, id: makeId() }));
      current = [...current, ...usable];
      entry.added = usable.length;
    } catch (error) {
      // A failed gap pass is not fatal: the next check (or the fallback) handles it.
      entry.error = error.message;
    }
  }

  const stillMissingMusts = findUncovered(requirements, current).filter((r) => r.priority === "must");
  const fallbacks = stillMissingMusts.map((r) => fallbackQuestion(r, makeId()));
  current = [...current, ...fallbacks];
  if (fallbacks.length > 0) log.at(-1).fallbacks = fallbacks.map((q) => q.requirement_ids[0]);

  return {
    questions: current,
    uncovered_requirement_ids: findUncovered(requirements, current).map((r) => r.id),
    passes: checks,
    log,
  };
}

export function fallbackQuestion(requirement, id) {
  const behavioural = requirement.kind === "behavioural";
  return {
    id,
    requirement_ids: [requirement.id],
    category: behavioural ? "behavioural" : "technical",
    prompt: `Walk me through your experience with: ${requirement.text}. What did you do, what was hard, and what would you do differently?`,
    answer_outline:
      "Pick one concrete example. Situation and your role; what you did and why; the result, with a number if you have one; what you learned.",
    difficulty: 2,
    state: "generated",
    origin: "ai",
    fallback: true, // added by code because the model left this must-have uncovered
  };
}

// Next "q<n>" after the highest existing one. The builder passes its own makeId
// backed by a kit-level counter, so deleted ids are never reused (D8).
export function sequentialIdMaker(questions) {
  let highest = 0;
  for (const q of questions) {
    const match = /^q(\d+)$/.exec(q.id ?? "");
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return () => `q${(highest += 1)}`;
}
