// Shared by the pipeline and kit-job tests: a fake model that answers by call label,
// and pipeline deps pointed at the local fixture sites.
import assert from "node:assert/strict";
import { createFetcher } from "../../src/pipeline/retrieval/fetch-page.js";
import { PipelineError } from "../../src/pipeline/errors.js";

export const JD = `Senior Backend Engineer
What you need
- Strong experience with Node.js in production
- You mentor other engineers
Bonus points for
- Aerospace background`;

export const REQUIREMENTS = [
  { text: "Node.js in production", quote: "Strong experience with Node.js in production", kind: "technical", priority: "must" },
  { text: "Mentoring", quote: "You mentor other engineers", kind: "behavioural", priority: "must" },
  { text: "Aerospace background", quote: "Aerospace background", kind: "domain", priority: "nice" },
];

// Answers each call by its label, like the real steps would; records every call.
// gate: a promise every call waits on first, so a test can hold a generation
// "in progress" and release it later.
export function fakeLlm({ requirements = REQUIREMENTS, questions, failLabel, gate } = {}) {
  const calls = [];
  const reply = (data) => ({ data, usage: { total_tokens: 10 } });
  return {
    calls,
    chatJson: async ({ label, model, user }) => {
      calls.push({ label, model, user });
      if (gate) await gate;
      if (failLabel && label.startsWith(failLabel)) {
        throw new PipelineError("LLM_BAD_OUTPUT", `${label}: the model returned invalid output twice.`);
      }
      if (label === "extract requirements") {
        return reply({ title: "Senior Backend Engineer", seniority: "senior", location: "Remote", responsibilities: ["Build APIs"], requirements });
      }
      if (label === "company brief") return reply({ summary: "Acme builds rockets.", what_they_do: "Rockets." });
      if (label === "interview process") {
        return reply({ stages: [{ name: "Take-home", kind: "take-home", description: "A small project." }, { name: "Design", kind: "system-design", description: "" }] });
      }
      if (label.startsWith("questions: ") || label.startsWith("gap pass")) {
        const ids = [...user.matchAll(/- (r\d+) \(/g)].map((m) => m[1]);
        if (ids.length === 0) return reply({ questions: [{ prompt: `General (${label})?`, answer_outline: "", difficulty: 1, requirement_ids: [] }] });
        const list = questions ? questions(label, ids) : ids.map((id) => ({ prompt: `About ${id} (${label})?`, answer_outline: "a; b", difficulty: 2, requirement_ids: [id] }));
        return reply({ questions: list });
      }
      if (label === "answer coach") return reply({ covered: ["Named the event loop phases"], missed: ["Backpressure"], improvement: "Add one production example." });
      if (label === "flashcards") return reply({ flashcards: [{ front: "Event loop?", back: "Phases.", requirement_ids: ["r1"] }] });
      throw new Error(`unexpected call ${label}`);
    },
  };
}

// Pipeline deps for tests: real fetcher (no politeness delay) that counts requests.
export function testPipelineDeps(llm) {
  const fetcher = createFetcher({ allowPrivate: true, minIntervalMs: 0, sleep: async () => {} });
  const counted = { fetches: 0, fetchResource: (...args) => (counted.fetches++, fetcher.fetchResource(...args)) };
  return {
    llm,
    models: { strong: "strong", fast: "fast" },
    fetcher: counted,
    tavilyApiKey: "",
    searchFetch: async () => assert.fail("a private fixture host must not be searched"),
    now: () => new Date("2026-11-21T10:00:00Z"),
  };
}

