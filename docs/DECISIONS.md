# Decisions

One entry per decision, newest last. Each says what we chose, what else we considered, and why. The README's "key decisions" section is drawn from here.

---

## D1 — Use Trao's preferred stack

**Date:** 2026-11-20

**Decision:** Next.js + Tailwind CSS (frontend), Node.js + Express (backend), MongoDB (database), TypeScript or JavaScript (decided in a later entry).

**Considered:** an alternative stack, with a README justification.

**Why:** the brief accepts equivalents but scores no points for them; sticking to the preferred stack removes a justification we would otherwise owe and keeps the reasoning budget for the parts that are scored.

---

## D2 — npm workspaces: `web/`, `api/`, `shared/`

**Date:** 2026-11-20

**Decision:** one repo, three npm workspaces. `web/` is the Next.js app. `api/` holds the Express server, the pipeline and the `evaluate` CLI. `shared/` holds only the kit contract (enums now, the full schema with the pipeline).

**Considered:** `web/` + `api/` only, with the kit types copied into the frontend.

**Why:** the kit shape is exact and is used in three places (pipeline validation, API, UI); one definition cannot drift. The pipeline sits inside `api/` so the CLI and the server import the same functions, which the brief requires ("the same code your application uses"). One `npm install` at the root sets up everything, which keeps the clean-clone run to a single documented step.

---

## D3 — JavaScript (ES modules), not TypeScript

**Date:** 2026-11-20

**Decision:** plain JavaScript with ES modules (`"type": "module"`) across all three workspaces.

**Considered:** TypeScript, for compile-time checks on the exact kit field names.

**Why:** Vishwas's call: less setup and no build step for the API and CLI, so `npm run evaluate` runs straight from source on a clean clone. The kit shape is still enforced at runtime by schema validation before anything is saved or written.

---

## D4 — Node built-ins over dependencies where they suffice

**Date:** 2026-11-20

**Decision:** `node:test` for API tests, `node --env-file-if-exists` for `.env` loading, `node:util` `parseArgs` for CLI flags. Minimum Node 22.9 (`engines`).

**Considered:** Jest or Vitest, `dotenv`, `yargs`/`commander`.

**Why:** each built-in covers our need completely, with zero install weight and nothing extra to justify. `--env-file-if-exists` (Node ≥ 22.9) lets the grader run without a `.env` file when no key is needed.

---

## D5 — Groq as the LLM provider, behind an OpenAI-compatible client

**Date:** 2026-11-20

**Decision:** Groq's free tier, called through the OpenAI-compatible chat API. Provider is set entirely by env: `LLM_BASE_URL`, `LLM_API_KEY`, and two models:
- `LLM_MODEL` = `openai/gpt-oss-120b` — requirement extraction, question generation, gap pass (the quality-critical steps; extraction alone is 20 points).
- `LLM_MODEL_FAST` = `openai/gpt-oss-20b` — company brief and flashcards (largest inputs, easier summarising work).

**Live limits (read from `x-ratelimit-*` response headers, 2026-11-20):** each chat model has its own 8,000 tokens/minute and 1,000 requests/day. Two models therefore give ~16K tokens/minute combined. Tokens/day is not reported in headers (blogs say ~200K per model). `qwen/qwen3.8-27b` has the same limits and is held in reserve as a third budget, added only if a timed batch run needs it.

**Gotcha:** gpt-oss models are reasoning models and their reasoning tokens count against tokens/minute. Send `reasoning_effort: "low"` on calls that don't need deep reasoning.

**Considered:**
- Gemini Flash-Lite: far higher tokens-per-minute (reported ~250K), but only ~15 requests/minute and Google has cut free limits before (Flash fell to ~20 requests/day).
- OpenRouter free models: ~50 requests/day without credits, about one batch run.

**Why:** Vishwas's call. Groq is the fastest inference available, which makes the "watch it generate" UI feel quick, and has generous request limits (~30/minute, ~1,000/day). Its weak spot is tokens: ~8K tokens/minute and ~200K tokens/day **per model** (reported, Nov 2026), against an estimated ~150K tokens for a 5-case batch. The design must therefore keep token use lean and respect the per-minute budget:
- cap cleaned page text per page; send only what each step needs;
- a client-side limiter that budgets tokens per minute, not just requests;
- retry 429/5xx with exponential backoff + jitter, honouring `Retry-After`;
- split steps across two models (above), since limits are per model.

The OpenAI-compatible client keeps a switch to Gemini (or any compatible provider) a config change, not a code change.
