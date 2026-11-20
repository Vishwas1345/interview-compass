// Company brief (spec step 4). The fast model summarises only the pages we fetched;
// when there is nothing to summarise, code writes an honest brief without a call.

import { z } from "zod";
import { wrapUntrusted, UNTRUSTED_RULE } from "../../lib/llm/untrusted.js";

export const BRIEF_INPUT_CAP = 12_000;

const schema = z.object({ summary: z.string(), what_they_do: z.string() });

const SYSTEM = `You write a short company brief for someone preparing for a job interview, using ONLY the web pages provided.

Return JSON: { "summary": 2-4 sentences, "what_they_do": 1-2 sentences on the product or service }.

- Use only facts stated in the pages. Do not use outside knowledge about the company, even if you recognise it.
- If the pages do not say what the company does, set "what_they_do" to "The pages we could read do not say what the company does." and say so in the summary.
- Mention the hiring process in the summary only if a page describes it.
- Plain, neutral language; no marketing adjectives.

${UNTRUSTED_RULE}`;

// → { summary, what_they_do, sources, usage }
export async function writeBrief({ companyName, crawl, llm, model }) {
  if (!crawl.reachable) {
    const reason = crawl.skipped[0]?.reason ? ` (${crawl.skipped[0].reason})` : "";
    return {
      summary: `The company website could not be reached${reason}, so this kit contains no company research. Everything in it is built from the job description alone.`,
      what_they_do: "Unknown — no company pages could be read.",
      sources: [],
      usage: null,
    };
  }

  // Home and about pages first: they say what the company does.
  const order = { home: 0, about: 1, hiring: 2 };
  const pages = [...crawl.pages].sort((a, b) => order[a.kind] - order[b.kind]);
  const used = [];
  let budget = BRIEF_INPUT_CAP;
  const blocks = [];
  for (const page of pages) {
    if (budget <= 200) break;
    const text = page.text.slice(0, budget);
    budget -= text.length;
    used.push(page.url);
    blocks.push(wrapUntrusted(page.url, `${page.title}\n\n${text}`));
  }

  const { data, usage } = await llm.chatJson({
    model,
    label: "company brief",
    system: SYSTEM,
    user: `Company: ${companyName}\n\n${blocks.join("\n\n")}`,
    schema,
    maxTokens: 1200,
  });

  const onlyHome = crawl.pages.length === 1;
  const note = onlyHome ? " We found no about or hiring page on this site, so this brief is based on the homepage only." : "";
  return { summary: data.summary.trim() + note, what_they_do: data.what_they_do.trim(), sources: used, usage };
}
