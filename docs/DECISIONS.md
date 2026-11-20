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

---

## D6 — Retrieval: `fetch` + cheerio, links ranked by code

**Date:** 2026-11-20

**Decision:**
- Fetch pages with Node's built-in `fetch`; parse and clean HTML with `cheerio` (strip script, style, nav, footer; keep main text).
- Crawl: read `robots.txt` (`robots-parser`) and `sitemap.xml` if present, collect same-site links from the homepage, **score each link in code** by keywords in its path and anchor text (hiring: careers, jobs, hiring, interview, handbook, join; about: about, company, team, engineering, culture), fetch the top ~6–8 at most 2 levels deep. Relative links resolved against the page URL; no host assumptions.
- Limits: ~1 request/second per host, 10 s timeout, retry with backoff, `text/html` only, ~2 MB max, cleaned text capped per page before it reaches the LLM.
- URL safety: reject private and loopback addresses when `ALLOW_PRIVATE_URLS` is false; it defaults to true unless `NODE_ENV=production`, so the CLI and local dev can reach the grader's `localhost` sites while the deployed API cannot.

**Considered:** a headless browser (Playwright) to render JavaScript-only sites; asking the LLM to rank links.

**Why:** a headless browser adds a ~150 MB browser download (breaks "no setup beyond install" on a clean clone) and strains free hosting memory; careers and about pages are almost always server-rendered. Ranking links in code costs no tokens (Groq tokens are the scarcest resource, D5), gives the same answer every run, and is testable.

---

## D7 — Public discussion: Tavily + Hacker News, honest when empty

**Date:** 2026-11-20

**Decision:** search for "<company name> interview process / experience" using Tavily when `TAVILY_API_KEY` is set, and Hacker News (Algolia API, no key) always. The search term is the company name taken from the homepage title, not the domain. Search is skipped for private hosts, with the reason recorded. If nothing is found, the kit says so plainly.

**Considered:** Brave Search API (now needs a card), scraping DuckDuckGo/Google result pages (captchas, against their terms).

**Why:** Tavily has a no-card free plan (1,000 searches/month) and returns cleaned text built for LLMs; HN search needs no key, so a clean clone without a Tavily key still searches somewhere. Both outputs are untrusted text, capped and delimited like crawled pages.

---

## D8 — Edit state: a label on every item, regeneration is a merge

**Date:** 2026-11-20

**Decision:**
1. Every question, flashcard and brief field carries `state` (`generated` | `edited` | `pinned`) and `origin` (`ai` | `user`). Editing flips `generated` → `edited`; pinning is an explicit button; user-written items start as `origin: user, state: edited`. Anything not `generated` is **protected**.
2. Regenerating a question category keeps protected items in place, removes that category's `generated` items, asks the LLM for replacements (told which items are kept and which were dismissed), validates the response, assigns **new, never-reused ids**, then re-runs the coverage check in code.
3. Deleting a generated question adds its prompt to a per-category `dismissed` list, passed to the LLM as "do not suggest these again".
4. Regenerating the brief when a field is `edited` asks first ("You edited this. Replace it anyway?"); nothing is overwritten silently. The schedule is recomputed in code; question ids removed by a regeneration are dropped from it and the schedule is flagged stale until rebuilt.
5. The merge reads the kit as it is when generation **finishes**, so edits made mid-generation are protected. Every write carries the kit's `version`; a write against an old version is rejected and retried (optimistic concurrency).
6. `state`, `origin` and `dismissed` are additive fields; every Appendix A field is unchanged.

**Considered:** an edit log replayed onto the regenerated kit; versioned snapshots with a manual merge UI.

**Why:** the label moves "may this be replaced?" from a guess at merge time to a fact recorded at edit time, so the merge is a filter that is easy to test and to explain. The edit log breaks when operations point at items a regeneration removed; snapshots hand the merge back to the user. A kit is one MongoDB document, so each merge is one atomic update.

---

## D9 — Hosting: Vercel (web), Render free (API), MongoDB Atlas M0 (database)

**Date:** 2026-11-20

**Decision:** `web/` on Vercel's free plan; `api/` as a Render free web service (an always-on Node process); MongoDB Atlas free M0 cluster. Production sets `NODE_ENV=production` and `ALLOW_PRIVATE_URLS=false` (D6).

**Considered:** running the API as Vercel serverless functions; Koyeb's free instance.

**Why:** generation takes 60–90 seconds, which suits a long-running process and not a function with a short timeout; fitting it into functions would mean splitting the pipeline purely to dodge a platform limit. Render's free tier needs no card and is well documented. Vercel is the native home for Next.js. A kit is a few KB, so Atlas M0 (512 MB) is ample.

**Cost we accept:** Render's free service sleeps after ~15 minutes idle and takes ~50 seconds to wake; the UI pings the API on load and shows a "waking the server" state rather than a silent hang.

---

## D10 — Sessions: a server-side session in a first-party httpOnly cookie

**Date:** 2026-11-20

**Decision:** Login sets `ic_session`, a random 32-byte token, in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production) lasting 7 days and renewed at most once a day while used. MongoDB stores only the token's SHA-256 with an expiry (TTL index). The web app proxies `/api/*` to the API, so the browser only ever talks to the web origin and the cookie is first-party. Passwords use Node's `scrypt` with a per-user salt, compared in constant time; an unknown email runs a dummy hash so timing does not reveal which emails exist. Mutations must be JSON (a declared body type other than `application/json` gets 415), which with `SameSite=Lax` blocks cross-site form posts.

**Considered:** the API setting its cookie directly on its own domain (`SameSite=None`); a JWT kept in `localStorage` and sent as a header.

**Why:** the web app (Vercel) and the API (Render) are on different sites, so a cookie set by the API is third-party, which Safari blocks and Chrome restricts. A JWT in `localStorage` is readable by any injected script and cannot be revoked at logout. Server-side sessions make logout and expiry real, and hashing the stored token means a database leak exposes no live session.

---

## D11 — MongoDB through the official driver; tests on a real throwaway MongoDB

**Date:** 2026-11-20

**Decision:** The API uses the official `mongodb` driver with no ODM. Collections and indexes are declared in one module (`api/src/db/mongo.js`). Tests run against `mongodb-memory-server`, a real `mongod` started per test file.

**Considered:** Mongoose; a hand-written in-memory fake of the collections; a test database on Atlas.

**Why:** the kit is already validated by the shared zod contract (`validateKit`), so a Mongoose schema would be a second copy that drifts from it. A fake would not enforce unique and partial indexes, and those indexes carry real rules ("one account per email", "one generation per user"). An Atlas test database would make `npm test` fail from a clean clone without credentials. **Cost we accept:** the first test run downloads a ~77 MB `mongod` binary, cached afterwards.

---

## D12 — Generation runs as a background job; the kit document is its state

**Date:** 2026-11-20

**Decision:** `POST /api/kits` inserts the kit as `generating` and returns 202 at once; the pipeline runs in the API process and writes its progress events and each finished step's result (`checkpoint`) into the kit document. The page polls `GET /api/kits/:id`. On startup, any kit still `generating` is marked `interrupted` (one instance runs every job); **Resume** reruns the pipeline with the saved checkpoint, so finished steps are reused (shown as "reused" in the progress) and not paid for again. Duplicates: a partial unique index allows one `generating` kit per user, so two simultaneous Generate clicks can never both insert; the loser joins the running kit. A second, different posting while one runs gets `GENERATION_RUNNING`; the same posting after it finished gets `DUPLICATE` with "open it / create anyway". At most 10 new kits per user per rolling 24 hours.

**Considered:** a job queue (BullMQ with Redis, Agenda); streaming progress with server-sent events; restarting failed runs from scratch.

**Why:** a single free instance gains nothing from a queue but a Redis dependency. Polling a document works through every proxy (the web rewrite, Render's front end), where a long-lived stream can be buffered or cut, and the document makes progress visible from any tab or device. Checkpoints answer the brief's "persist enough to resume": a restart after research costs only the remaining steps (in a live test, a kill after five steps resumed with all five reused). The database index settles the double-click race; code-level checks alone lost it in testing.
