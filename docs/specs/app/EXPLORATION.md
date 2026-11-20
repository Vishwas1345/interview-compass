# App (accounts, kits, builder, practice) — Exploration

**Feature in one line:** a signed-in user creates a prep kit from the web app, watches it generate, edits it, regenerates parts without losing edits, and practises it.
**Explored at:** `main` @ `5a97271`

## Services involved

| Service | Role in this feature |
|---|---|
| `api/` (Express 5) | Accounts and sessions, kit storage, generation jobs, edit/regenerate endpoints. Runs the existing pipeline. |
| `web/` (Next.js 16, App Router, Tailwind 4) | Every screen. Talks only to its own origin; API calls are proxied. |
| `shared/` | The kit contract (`validateKit`), already used by the pipeline; the API reuses it before every save. |
| MongoDB Atlas M0 | Users, sessions, kits (D9). Not connected yet. |

## Where it lands

| What | File:line | Notes |
|---|---|---|
| Express app factory | `api/src/app.js:4` | Only `/health` and `express.json({ limit: "200kb" })` today. Routes mount here. [Certain] |
| Server entry | `api/src/server.js:1` | Listens on `PORT`; no DB connection yet. [Certain] |
| Config | `api/src/config.js:2` | `loadConfig(env)`; new vars (`MONGODB_URI`, session settings, web origin) go here and in `.env.example`. [Certain] |
| Pipeline entry | `api/src/pipeline/run-pipeline.js` → `runPipeline(input, deps)`, `createPipelineDeps(config)` | Same code path as the batch CLI. Reports progress through `onProgress({ step, status, ms })`. Returns a validated kit. [Certain] |
| One category of questions | `api/src/pipeline/generation/questions.js:44` `generateQuestions({ category, requirements, count, context, avoid, gapMode })` | `avoid` already exists: protected and dismissed prompts can be passed for regeneration (D8 rules 2–3). [Certain] |
| Gap loop | `api/src/pipeline/coverage/coverage.js:20` `closeGaps({ …, makeId })` | `makeId` is injectable so the builder can use a never-reused id counter (D8). [Certain] |
| Brief | `api/src/pipeline/generation/brief.js:23` `writeBrief({ companyName, crawl, llm, model })` | Needs the crawl result, so a "regenerate brief" must either re-crawl or reuse stored page texts. [Certain] |
| Schedule | `api/src/pipeline/schedule/allocate.js:16` `allocateSchedule({ questions, requirements, days })` | Pure function; "regenerate schedule" and "change days" are a direct call. [Certain] |
| Kit validation | `shared/src/kit-schema.js:95` `validateKit(kit, { daysRequested })` | Enforces "no uncovered must-have" and "every must-have scheduled". A user edit can legitimately break both (delete the only question for a must-have), so saving user edits needs a mode that reports these as warnings. [Certain] |
| Web home page | `web/src/app/page.js` | Placeholder. [Certain] |
| Web config | `web/next.config.mjs` | `cacheComponents: true`, `transpilePackages: ["@interview-compass/shared"]`. Rewrites to an external URL are supported (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md:328`). `middleware.js` is renamed `proxy.js` in Next 16 (`…/03-file-conventions/middleware.md:11`). [Certain] |

## Pattern to follow

The batch CLI (`api/src/cli/evaluate.js`) is the closest existing caller of the pipeline: build deps once per process (the LLM client holds the shared per-model rate budget), call `runPipeline` per request, turn `PipelineError.code` into a structured error. The API generation job copies this, writing progress to the kit document instead of stderr.

## Data

Nothing persisted yet. What the pipeline already produces that the app needs:
- The kit (Appendix A + additive fields: `state`/`origin` per item, `research`, `coverage.log`, `question_plan`, `schedule.days[].kind`).
- Per-step outputs that a resume or a later regeneration needs and the kit does **not** keep today: crawled page texts (for "regenerate brief"), the interview process (kept as `research.interview_stages`), discussion sources (kept).
- Missing from D8 so far: kit `version`, per-category `dismissed` lists, the never-reused id counters, per-item practice confidence.

## Cross-cutting

- **Auth:** none yet. Brief: register, login, logout, sessions, own kits only, expired sessions; no email verification or reset.
- **Validation:** `zod` is already an API dependency (`api/package.json`); `validateKit` for kits.
- **Errors:** `PipelineError(code, message)` with `ERROR_CODES` (`api/src/pipeline/errors.js`). API errors should reuse the same `{ code, message }` shape as the batch output.
- **Logging:** pipeline progress events; no request logging yet.
- **Idempotency / duplicates:** none yet. Brief edge case: "Same JD + company submitted twice", "double triggers".
- **Rate limits:** the LLM client paces per model inside one process (D5); many users share one budget.

## Constraints & pitfalls

- Contracts are exact; app fields must be additive (`AGENTS.md` → Hard rules).
- D8 is the agreed edit-state model; regeneration is a merge, writes are versioned.
- D9: API on Render (sleeps after ~15 min, ~50 s wake), web on Vercel, DB on Atlas M0. Different sites → a cookie set by the API directly is a third-party cookie that browsers increasingly block; proxying `/api/*` through the web app keeps it first-party.
- Generation takes ~60–125 s (timed run, GAPS G8): too long for one HTTP request through proxies; it has to run as a background job the page follows.
- Next.js 16 APIs differ from training data: read `web/AGENTS.md` and the bundled docs before frontend code.
- Production sets `ALLOW_PRIVATE_URLS=false` (D6), so the deployed app cannot crawl `localhost` sites; only the batch CLI does.

## Tests

`node:test` in `api/test/*.test.js`; apps are mounted with `createApp().listen(0)` (`api/test/health.test.js`). Fake LLM by label (`api/test/run-pipeline.test.js`), fixture site server (`api/test/fixtures/server.js`). No DB test helper yet; none for `web/`.

## Parallel work

None: single developer, all work on `main` (`git log`).

## Open questions

Settled in the spec: practice ordering, creative feature, duplicate submissions, abuse limits.
