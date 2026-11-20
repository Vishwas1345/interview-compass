// Request bodies for kits: create, builder operations, regeneration, practice, coach.
import { z } from "zod";
import { DAYS_MIN, DAYS_MAX, QUESTION_CATEGORIES } from "@interview-compass/shared";
import { MAX_JD_CHARS } from "../pipeline/extraction/extract-requirements.js";
import { ANSWER_MAX } from "../services/coach.service.js";

export const createKitBody = z.object({
  jd: z.string().trim().min(1, "Paste the job description.").max(MAX_JD_CHARS, `The job description is longer than ${MAX_JD_CHARS} characters.`),
  company_url: z.string().trim().min(1, "Enter the company website.").max(2000, "The website address is too long."),
  days: z.int("Days must be a whole number.").min(DAYS_MIN, `Days must be from ${DAYS_MIN} to ${DAYS_MAX}.`).max(DAYS_MAX, `Days must be from ${DAYS_MIN} to ${DAYS_MAX}.`),
  force: z.boolean().optional(),
});

// The op itself is validated by kit-ops.service (opSchema); here only its envelope.
export const operationBody = z.object({ version: z.int().min(1), op: z.object({ type: z.string() }).loose() });

export const regenerateBody = z.discriminatedUnion("target", [
  z.object({ target: z.literal("brief"), confirm: z.boolean().optional() }),
  z.object({ target: z.literal("category"), category: z.enum(QUESTION_CATEGORIES) }),
]);

// Item ids become part of a field path, so only q<n>/f<n> are accepted.
const itemId = z.string().regex(/^[qf]\d{1,6}$/, "Unknown card.");
export const practiceBody = z.object({ itemId, confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]) });
export const coachBody = z.object({
  itemId,
  answer: z.string().trim().min(1, "Type an answer first.").max(ANSWER_MAX, `Answers are limited to ${ANSWER_MAX} characters.`),
});
