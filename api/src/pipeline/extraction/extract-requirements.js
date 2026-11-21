// Requirement extraction (spec step 1). The job description is pasted text, so no
// retrieval happens here. The strong model reads it; our code then decides what
// survives: every requirement must quote the posting word for word, and any number
// in it must appear in that quote. Unverifiable requirements are dropped and
// reported, never kept. Ids (r1, r2, …) are assigned by code.

import { z } from "zod";
import { REQUIREMENT_KINDS, REQUIREMENT_PRIORITIES } from "@interview-compass/shared";
import { wrapUntrusted, UNTRUSTED_RULE } from "../../lib/llm/untrusted.js";

export const MAX_JD_CHARS = 20_000;

const modelSchema = z.object({
  title: z.string().default(""),
  seniority: z.string().default(""),
  location: z.string().default(""),
  responsibilities: z.array(z.string()).default([]),
  requirements: z
    .array(
      z.object({
        text: z.string(),
        kind: z.enum(REQUIREMENT_KINDS),
        priority: z.enum(REQUIREMENT_PRIORITIES),
        quote: z.string(),
      }),
    )
    .default([]),
});

const SYSTEM = `You extract the requirements from one job posting. Accuracy matters more than completeness: a requirement the posting does not state is a serious error, and an empty list is the correct answer for a posting that states none.

Return JSON:
{
  "title": job title as written, or "",
  "seniority": one of intern, junior, mid, senior, staff, principal, lead, manager — or "" if the posting does not say,
  "location": as written, or "",
  "responsibilities": up to 8 short phrases for what the person will DO (not what they must have),
  "requirements": [{ "text", "kind", "priority", "quote" }]
}

Requirements: what the candidate must have or would ideally have.
- "text": a short phrase (at most 12 words) in the posting's own terms. Keep numbers exactly ("5+ years").
- "quote": the exact words from the posting this requirement comes from — copied character for character, 2 to 30 words, from one place. It will be checked against the posting; a quote that is not found word for word causes the requirement to be discarded.
- "priority": "must" for anything presented as required ("required", "you have", "must", "what you need", "requirements", "minimum qualifications", or plain lists of qualifications). "nice" for anything presented as optional ("bonus", "nice to have", "preferred", "a plus", "ideally", "familiarity with … is a plus"). A section heading applies to every line under it.
- "kind": "technical" for tools, languages, technical skills and engineering experience; "behavioural" for how someone works with people (communication, mentoring, leadership, collaboration, ownership); "domain" for industry or business knowledge (fintech, healthcare, aerospace).
- One requirement per distinct skill or experience. Do not split a line into trivial pieces; do not merge unrelated lines.
- Never add generic requirements the posting does not state (e.g. "communication skills", "team player", a degree).
- Responsibilities are not requirements; do not repeat them as requirements.

${UNTRUSTED_RULE}`;

// → { title, seniority, location, responsibilities, requirements, dropped, usage }
export async function extractRequirements({ jd, llm, model, log = () => {} }) {
  const posting = String(jd).slice(0, MAX_JD_CHARS);
  const { data, usage } = await llm.chatJson({
    model,
    label: "extract requirements",
    system: SYSTEM,
    user: wrapUntrusted("job description", posting),
    schema: modelSchema,
    maxTokens: 4000,
    reasoningEffort: "medium", // the highest-scoring step: worth the extra reasoning tokens
  });

  const { kept, dropped } = verifyRequirements(posting, data.requirements);
  for (const d of dropped) log(`extract: dropped "${d.text}" — ${d.reason}`);

  return {
    title: data.title.trim(),
    seniority: data.seniority.trim().toLowerCase(),
    location: data.location.trim(),
    responsibilities: data.responsibilities.map((r) => r.trim()).filter(Boolean).slice(0, 8),
    requirements: kept.map((r, i) => ({
      id: `r${i + 1}`,
      text: r.text.trim(),
      kind: r.kind,
      priority: r.priority,
      source_quote: r.quote.trim(),
    })),
    dropped,
    usage,
  };
}

// Pure: keeps requirements whose quote is in the posting and whose numbers come from
// that quote; drops duplicates. Comparison ignores case, punctuation and spacing.
export function verifyRequirements(posting, requirements) {
  // Spaces around both sides: a quote must match whole words, so "java" is not found
  // inside "javascript" (review C8).
  const haystack = ` ${normalise(posting)} `;
  const kept = [];
  const dropped = [];
  const seen = new Set();

  for (const r of requirements) {
    const quote = normalise(r.quote);
    const text = normalise(r.text);
    let reason = null;
    if (!text) reason = "empty text";
    else if (quote.split(" ").filter(Boolean).length < 1) reason = "no source quote";
    else if (!haystack.includes(` ${quote} `)) reason = "its quote does not appear in the posting";
    else if (!groundedIn(text, quote)) reason = "its wording is not in its quote";
    else if (!numbersIn(r.text).every((n) => numbersIn(r.quote).includes(n))) reason = "it contains a number its quote does not";
    else if (seen.has(text)) reason = "duplicate";
    if (reason) {
      dropped.push({ text: r.text, quote: r.quote, reason });
    } else {
      seen.add(text);
      kept.push(r);
    }
  }
  return { kept, dropped };
}

// Words that carry no requirement of their own: grammar, and the filler the model
// adds around a quoted skill ("Experience with Docker" quoting "Docker").
const NOT_CONTENT = new Set(
  ("a an and or the of in on at to for with by from as is are be your our you we it its this that " +
    "experience experienced strong solid deep good working hands proven knowledge familiarity familiar " +
    "proficiency proficient understanding skills skill ability able background").split(" "),
);

// Two words match when equal, or when they share a stem of at least five letters
// ("mentor" ~ "mentoring", "postgres" ~ "postgresql"; not "java" ~ "javascript").
function sameWord(a, b) {
  if (a === b) return true;
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common += 1;
  return common >= 5;
}

// The requirement's own wording must come from its quote (review C8): at least two
// thirds of its content words appear there, so "Kubernetes experience" cannot ride on
// a quote that only says "experience".
function groundedIn(text, quote) {
  const words = text.split(" ").filter((w) => w.length > 1 && !NOT_CONTENT.has(w) && !/^\d+$/.test(w));
  if (words.length === 0) return true; // only filler or numbers: numbers are checked separately
  const quoted = quote.split(" ");
  const found = words.filter((w) => quoted.some((q) => sameWord(w, q))).length;
  return found / words.length >= 2 / 3;
}

export function normalise(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9+#]+/g, " ") // keep "c++", "c#"; everything else is spacing
    .trim();
}

function numbersIn(value) {
  return String(value).match(/\d+/g) ?? [];
}
