// Answer coach (app spec Decision 2, the creative feature). The candidate types an
// answer before revealing; the fast model compares it with the answer outline and
// the requirements the question tests, and says what it covered, what it missed and
// one concrete improvement. It never writes the answer for them.

import { z } from "zod";
import { wrapUntrusted, UNTRUSTED_RULE } from "../lib/llm/untrusted.js";

export const ANSWER_MAX = 3000;

const schema = z.object({
  covered: z.array(z.string()).default([]),
  missed: z.array(z.string()).default([]),
  improvement: z.string().default(""),
});

const SYSTEM = `You coach a candidate rehearsing an interview answer.

Compare the candidate's answer with the reference outline and the requirements the question tests.
Return JSON: { "covered": [...], "missed": [...], "improvement": "..." }
- "covered": up to 4 short points the answer handled well, each tied to the outline or a requirement.
- "missed": up to 4 short points from the outline or the requirements the answer left out or got wrong. Empty if nothing important is missing.
- "improvement": the single most valuable thing to add next, as one sentence starting with a verb (e.g. "Add how you would …"). Pick ONE point from "missed"; never list several, never give the full solution.
- Never write a model answer or rewrite theirs. Be direct and kind; no praise padding.
- If the answer is empty, off-topic or only says it does not know, say so in "missed" and suggest how to start in "improvement".

${UNTRUSTED_RULE}`;

// item: { prompt, outline }; requirements: [{ id, text }] the question tests.
export async function coachAnswer({ item, requirements, answer, llm, model }) {
  const user = [
    wrapUntrusted("interview question", item.prompt),
    wrapUntrusted("reference outline", item.outline || "(no outline)"),
    "Requirements this question tests:",
    requirements.length ? requirements.map((r) => `- ${r.text}`).join("\n") : "- (none listed)",
    "",
    wrapUntrusted("candidate's answer", answer),
  ].join("\n");
  const { data } = await llm.chatJson({ model, label: "answer coach", system: SYSTEM, user, schema, maxTokens: 1200 });
  return {
    covered: data.covered.map((s) => s.trim()).filter(Boolean).slice(0, 4),
    missed: data.missed.map((s) => s.trim()).filter(Boolean).slice(0, 4),
    improvement: data.improvement.trim(),
  };
}

// In-memory limit per user (one process, D9): `max` calls per rolling hour.
export function createCoachLimiter({ max = 30, windowMs = 60 * 60 * 1000, now = () => new Date() } = {}) {
  const calls = new Map(); // userId → [timestamps]
  return {
    take(userId) {
      const t = now().getTime();
      const recent = (calls.get(userId) ?? []).filter((at) => at > t - windowMs);
      if (recent.length >= max) return false;
      recent.push(t);
      calls.set(userId, recent);
      return true;
    },
  };
}
