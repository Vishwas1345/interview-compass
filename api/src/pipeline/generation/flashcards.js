// Flashcards (spec step 9): the fast model condenses the kit's questions into short
// cards for quick recall. Cards naming unknown requirement ids lose those ids.

import { z } from "zod";

export const MAX_FLASHCARDS = 12;

const schema = z.object({
  flashcards: z
    .array(z.object({ front: z.string(), back: z.string(), requirement_ids: z.array(z.string()).default([]) }))
    .default([]),
});

const SYSTEM = `You turn interview-prep material into flashcards for quick recall.

Return JSON: { "flashcards": [{ "front", "back", "requirement_ids" }] }
- At most ${MAX_FLASHCARDS} cards. Prefer must-have requirements; aim for at least one card per must-have requirement listed.
- "front": a short cue or question (under 15 words). "back": the key facts or points, under 50 words.
- Cards test knowledge the candidate needs: concepts, definitions, trade-offs and the key points of strong answers. Never a card that restates the job posting itself (years of experience, "is X required?"), and no "tell me about a time" prompts.
- For behavioural requirements, a card covers what the interviewer listens for and how to structure the story (situation, task, action, result), e.g. "Ownership answer: what do interviewers listen for?". The candidate's own experience is theirs to supply: a card never states their past projects, achievements, metrics or results.
- "requirement_ids": ids from the list that the card supports. Use only listed ids.
- Use only the material given.`;

// → { flashcards: [{ front, back, requirement_ids, state, origin }], usage }
export async function makeFlashcards({ questions, requirements, llm, model }) {
  if (questions.length === 0) return { flashcards: [], usage: null };
  const allowed = new Set(requirements.map((r) => r.id));

  const material = [
    "Requirements:",
    ...requirements.map((r) => `- ${r.id} (${r.priority}): ${r.text}`),
    "",
    "Questions and answer outlines:",
    ...questions.map((q) => `- [${q.requirement_ids.join(", ") || "general"}] ${q.prompt}\n  Outline: ${q.answer_outline}`),
  ].join("\n");

  const { data, usage } = await llm.chatJson({ model, label: "flashcards", system: SYSTEM, user: material, schema, maxTokens: 2500 });

  const flashcards = data.flashcards
    .map((c) => ({
      front: c.front.trim(),
      back: c.back.trim(),
      requirement_ids: [...new Set(c.requirement_ids)].filter((id) => allowed.has(id)),
      state: "generated",
      origin: "ai",
    }))
    .filter((c) => c.front && c.back)
    .slice(0, MAX_FLASHCARDS);
  return { flashcards, usage };
}
