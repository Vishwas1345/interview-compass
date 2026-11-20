// Question generation (spec step 7): one model call per category, each with its own
// instructions and only the requirements that belong to it. The same function
// writes gap-pass questions (spec step 8) and, later, regenerated categories.
// The category comes from code; the model never chooses it.

import { z } from "zod";
import { wrapUntrusted, UNTRUSTED_RULE } from "../../llm/untrusted.js";

const schema = z.object({
  questions: z
    .array(
      z.object({
        prompt: z.string(),
        answer_outline: z.string().default(""),
        difficulty: z.number(),
        requirement_ids: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

const COMMON = `Return JSON: { "questions": [{ "prompt", "answer_outline", "difficulty", "requirement_ids" }] }
- "requirement_ids": the ids (from the list given) that the question genuinely tests. Use only listed ids.
- "answer_outline": 3-5 short points a strong answer covers, separated by "; ".
- "difficulty": 1 (fundamentals), 2 (applied), 3 (deep, trade-offs, ambiguity). Match the role's seniority.
- Questions must be specific to this role and its requirements, never generic filler. No duplicates of each other or of the "already in the kit" list.`;

const CATEGORY_RULES = {
  technical: `Write TECHNICAL interview questions that test the listed requirements in depth: concepts, debugging, trade-offs and realistic scenarios from the role's work.
- Each question tests one or two listed requirements; together they cover every listed requirement.`,
  behavioural: `Write BEHAVIOURAL questions ("Tell me about a time…", "How do you…") that probe the listed behavioural requirements through past experience.
- The answer outline follows STAR: situation, task, action, result, plus what the interviewer listens for.
- If no requirements are listed, ask about the role's responsibilities instead and use "requirement_ids": [].`,
  "system-design": `Write SYSTEM DESIGN prompts at the role's level.
- Ground each prompt in the company's real product or domain when the brief describes it; otherwise in the role's own work. State the scale to assume.
- The answer outline covers: requirements and constraints; components; data model; scaling and failure handling; key trade-offs.
- Difficulty 2 or 3.`,
  "company-fit": `Write COMPANY-FIT questions about motivation, the company's product, mission and ways of working.
- Use only facts from the company brief and interview process provided. If the brief says nothing could be found, ask about motivation for this role and kind of company instead, and never invent facts about the company.
- Tie a question to a listed requirement only if it genuinely tests it; otherwise "requirement_ids": [].`,
};

// → { questions: [{ prompt, answer_outline, difficulty, requirement_ids, category, state, origin }], usage }
export async function generateQuestions({ category, requirements, count, context, avoid = [], gapMode = false, llm, model }) {
  const allowed = new Set(requirements.map((r) => r.id));
  const rules = [CATEGORY_RULES[category], ...stageRules(category, context.process)].join("\n");
  const instructions = gapMode
    ? `Write exactly one question for EACH listed requirement, so that every one of them is tested. Category: ${category}.\n${rules}`
    : `Write ${count} questions.\n${rules}`;

  const { data, usage } = await llm.chatJson({
    model,
    label: gapMode ? `gap pass (${category})` : `questions: ${category}`,
    system: `You prepare a candidate for a job interview.\n${instructions}\n\n${COMMON}\n\n${UNTRUSTED_RULE}`,
    user: describeContext({ requirements, context, avoid }),
    schema,
    maxTokens: 3500,
  });

  const questions = data.questions
    .map((q) => ({
      requirement_ids: [...new Set(q.requirement_ids)].filter((id) => allowed.has(id)),
      category,
      prompt: q.prompt.trim(),
      answer_outline: q.answer_outline.trim(),
      difficulty: Math.min(3, Math.max(1, Math.round(q.difficulty) || 2)),
      state: "generated",
      origin: "ai",
    }))
    .filter((q) => q.prompt)
    // A question naming no valid requirement is kept only where general questions are expected.
    .filter((q) => q.requirement_ids.length > 0 || allowed.size === 0 || category === "company-fit" || category === "behavioural");

  return { questions, usage };
}

// Rules that depend on the published interview process are chosen here, in code,
// from the stages actually found — the model is never asked to apply an "if".
const STAGE_RULES = {
  technical: {
    "take-home": "The process includes a take-home: include one question asking the candidate to walk through and defend the design of a take-home-style solution for this role.",
    "live-coding": "The process includes live coding: include one practical question that can be worked through at a keyboard.",
    "pair-programming": "The process includes pair programming: include one practical question that can be worked through together at a keyboard.",
  },
  behavioural: {
    values: "The process includes a values interview: align questions with the company's stated values where the brief gives them.",
  },
  "system-design": {
    "system-design": "The process includes a system design round: mirror its format and topic as described.",
  },
};

export function stageRules(category, process) {
  if (!process?.published) return [];
  const kinds = new Set(process.stages.map((s) => s.kind));
  return Object.entries(STAGE_RULES[category] ?? {})
    .filter(([kind]) => kinds.has(kind))
    .map(([, rule]) => `- ${rule}`);
}

// The generateForGaps function the coverage loop calls: groups the uncovered
// requirements by category and asks for exactly one question each.
export function createGapGenerator({ context, llm, model, onUsage = () => {} }) {
  return async (uncovered) => {
    const groups = new Map();
    for (const r of uncovered) {
      const category = r.kind === "behavioural" ? "behavioural" : "technical";
      groups.set(category, [...(groups.get(category) ?? []), r]);
    }
    const results = [];
    for (const [category, requirements] of groups) {
      const { questions, usage } = await generateQuestions({ category, requirements, context, gapMode: true, llm, model });
      onUsage(usage);
      results.push(...questions);
    }
    return results;
  };
}

function describeContext({ requirements, context, avoid }) {
  const { role, brief, process } = context;
  const lines = [
    `Role: ${role.title || "(untitled)"}${role.seniority ? ` — ${role.seniority}` : ""}`,
    role.responsibilities?.length ? `Responsibilities: ${role.responsibilities.join("; ")}` : "",
    "",
    "Requirements for this category:",
    ...(requirements.length > 0 ? requirements.map((r) => `- ${r.id} (${r.priority}): ${r.text}`) : ["- (none listed)"]),
    "",
    "Interview process:",
    process.published
      ? wrapUntrusted("interview process", process.stages.map((s) => `${s.name} [${s.kind}]: ${s.description}`).join("\n"))
      : "No published interview process was found.",
    "",
    "Company brief:",
    wrapUntrusted("company brief", `${brief.summary}\n${brief.what_they_do}`),
  ];
  if (avoid.length > 0) lines.push("", "Already in the kit (do not repeat):", ...avoid.map((p) => `- ${p}`));
  return lines.filter((l) => l !== null).join("\n");
}
