// Interview process (spec step 5). Reads the stages a hiring page or public
// discussion describes. With nothing to read, records "no published process"
// without calling the model.

import { z } from "zod";
import { wrapUntrusted, UNTRUSTED_RULE } from "../../lib/llm/untrusted.js";

export const STAGE_KINDS = [
  "screen", "take-home", "live-coding", "pair-programming", "technical-interview",
  "system-design", "behavioural", "values", "other",
];
const HIRING_INPUT_CAP = 8000;
const DISCUSSION_INPUT_CAP = 4000;

const schema = z.object({
  stages: z
    .array(z.object({ name: z.string(), kind: z.enum(STAGE_KINDS), description: z.string().default("") }))
    .default([]),
});

const SYSTEM = `You read material about one company's hiring process and list the interview stages it describes, in order.

Return JSON: { "stages": [{ "name", "kind", "description" }] }
- "kind": one of ${STAGE_KINDS.join(", ")}.
- "description": one sentence: what happens and how long, only as stated.
- Only stages the material explicitly describes. If it describes none, return an empty list.
- Company pages outrank third-party posts when they disagree.

${UNTRUSTED_RULE}`;

// → { published, stages, source_urls, usage }
export async function readInterviewProcess({ crawl, discussion, llm, model }) {
  const hiringPages = crawl.pages.filter((p) => p.kind === "hiring");
  const posts = discussion?.sources ?? [];
  if (hiringPages.length === 0 && posts.length === 0) {
    return { published: false, stages: [], source_urls: [], usage: null };
  }

  const blocks = [];
  let budget = HIRING_INPUT_CAP;
  for (const page of hiringPages) {
    if (budget <= 200) break;
    const text = page.text.slice(0, budget);
    budget -= text.length;
    blocks.push(wrapUntrusted(`company page ${page.url}`, text));
  }
  budget = DISCUSSION_INPUT_CAP;
  for (const post of posts) {
    if (budget <= 200) break;
    const text = `${post.title}\n${post.snippet}`.slice(0, budget);
    budget -= text.length;
    blocks.push(wrapUntrusted(`third-party post ${post.url}`, text));
  }

  const { data, usage } = await llm.chatJson({
    model,
    label: "interview process",
    system: SYSTEM,
    user: blocks.join("\n\n"),
    schema,
    maxTokens: 1200,
  });

  return {
    published: data.stages.length > 0,
    stages: data.stages.map((s) => ({ name: s.name.trim(), kind: s.kind, description: s.description.trim() })),
    source_urls: [...hiringPages.map((p) => p.url), ...posts.map((p) => p.url)],
    usage,
  };
}
