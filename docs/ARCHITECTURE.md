# Architecture

How the system is put together. Each section is filled in as its decision lands in [`DECISIONS.md`](DECISIONS.md); a section saying _Pending_ has no agreed design yet.

## Overview

_Pending — brainstorm._

## Repository layout

npm workspaces (see D2). One `npm install` at the root installs all three.

```
interview-compass/
├── package.json          workspaces; root scripts: evaluate, test, lint, dev:api, dev:web
├── .env.example          every env var, documented
├── shared/               @interview-compass/shared — the kit contract (Appendix A), used by api and web
│   └── src/index.js
├── api/                  @interview-compass/api — Express server, pipeline, batch CLI
│   ├── src/
│   │   ├── app.js        builds the Express app (no listen — tests mount it)
│   │   ├── server.js     listens on PORT
│   │   ├── pipeline/     one folder per concern; the CLI and the routes call the same code
│   │   │   ├── retrieval/    fetch, clean, crawl, rank links, search
│   │   │   ├── extraction/   requirements from the JD
│   │   │   ├── generation/   brief, questions per category, flashcards
│   │   │   ├── coverage/     gap check — deterministic code
│   │   │   └── schedule/     day allocation — deterministic code
│   │   ├── llm/          provider client, rate limiting, retries
│   │   ├── routes/       HTTP endpoints
│   │   ├── db/           MongoDB access
│   │   └── cli/evaluate.js   `npm run evaluate -- --input … --output …`
│   └── test/             node:test
├── web/                  @interview-compass/web — Next.js 16 + Tailwind 4 (App Router, src/)
├── docs/                 brief, architecture, decisions, gaps, specs
└── .claude/skills/       project skills for repeated workflows
```

## Pipeline (retrieval → extraction → generation → coverage → schedule)

Spec: [`specs/pipeline/SPEC.md`](specs/pipeline/SPEC.md). One function, `api/src/pipeline/run-pipeline.js` → `runPipeline({ company_url, jd, days }, deps)`, runs the steps in order. The batch CLI and the API build `deps` with the same `createPipelineDeps(config)`, so there is one code path.

| # | Step | Module | Who decides |
|---|---|---|---|
| 1 | Requirements from the JD, each with a verbatim quote checked in code | `extraction/extract-requirements.js` | strong model + code check |
| 2 | Crawl the company site (robots, sitemap, links scored in code, ≤8 pages, depth 2) | `retrieval/crawl.js`, `fetch-page.js`, `robots.js`, `url-guard.js` | code |
| 3 | Public discussion (Tavily if keyed, Hacker News) | `retrieval/search.js` | code |
| 4 | Company brief from fetched pages only | `generation/brief.js` | fast model |
| 5 | Interview stages from hiring pages and discussion | `generation/interview-process.js` | fast model |
| 6 | Which categories, with which requirements | `generation/categories.js` | code |
| 7 | Questions, one call per category; stage-specific rules chosen in code | `generation/questions.js` | strong model |
| 8 | Coverage check + gap loop (≤3 checks) + fallback for must-haves | `coverage/coverage.js` | code (model writes gap questions) |
| 9 | Flashcards | `generation/flashcards.js` | fast model |
| 10 | Schedule | `schedule/allocate.js` | code |
| 11 | Validate against the contract | `shared/src/kit-schema.js` → `validateKit` | code |

**Failure model.** A case fails (`PipelineError` with a code) only when no kit can be made: invalid input, extraction failing, or the model service unavailable after retries. Anything else degrades: an unreachable or invalid site gives an honest brief, a broken model answer in steps 4/5/7/9 gives that step's honest empty result, and the kit records why in `research.notes`.

**Additive kit fields** (the contract allows extensions): `role.requirements[].source_quote`, per-item `state`/`origin` (D8), `questions[].fallback`, `schedule.days[].kind`, `coverage.log`, `question_plan`, `research` (pages tried with reasons, about/hiring/discussion found, interview stages, notes).

## Data model

MongoDB (D11), three collections; indexes declared in `api/src/db/mongo.js`.

| Collection | Holds | Indexes |
|---|---|---|
| `users` | `email` (lower-case), `passwordHash` (`scrypt$salt$hash`), `createdAt` | `email` unique |
| `sessions` | `_id` = SHA-256 of the cookie token, `userId`, `expiresAt` | TTL on `expiresAt` |
| `kits` | `userId`, `status` (`generating` / `ready` / `failed` / `interrupted`), `input` `{ jd, company_url, days }`, `dedupeKey`, `progress[]`, `checkpoint` (saved step results, D12), `error`, `kit` (Appendix A + additive fields), `version`, `counters` `{ q, f }`, `dismissed` `{ category: [prompt] }`, `scheduleStale`, `regenerating` (lock), `lastRegeneration`, `practice` `{ itemId: { confidence, count, lastAt } }` | `userId, createdAt`; `userId, dedupeKey`; `userId` unique where `status: "generating"` |

**Generated / edited / pinned (D8, D13).** Every question and flashcard carries `state` (`generated` | `edited` | `pinned`) and `origin` (`ai` | `user`); the brief carries `company_brief.field_state` per field. Editing a generated item makes it `edited`; pinning stores the previous state so unpinning restores it (an item edited while pinned returns to `edited`). Anything not `generated` is protected: a regeneration keeps it word for word, in its slot. Deleting an AI question records its prompt in `dismissed`, which the next regeneration of that category is told not to repeat. New items take ids from `counters`, so an id is never reused. `version` increases on every save; a write against an older version is refused.

## API

Express 5, everything under `/api` (the web app proxies `/api/*`, D10). Errors are `{ error: { code, message } }`.

| Method | Path | What |
|---|---|---|
| GET | `/api/health` | liveness (also wakes the free instance) |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | accounts; login sets the session cookie |
| GET | `/api/auth/me` | the signed-in user; 401 `UNAUTHENTICATED` or `SESSION_EXPIRED` |
| GET / POST | `/api/kits` | list; create (202, starts generation; 200 joins the same running one; 409 `DUPLICATE` / `GENERATION_RUNNING`; 429 `DAILY_LIMIT`) |
| GET / DELETE | `/api/kits/:id` | the kit with status, progress, warnings, practice; delete |
| POST | `/api/kits/:id/resume` | continue an interrupted or failed generation from its checkpoint |
| POST | `/api/kits/:id/ops` | one builder operation `{ version, op }` (D13); 409 `VERSION_CONFLICT` with the latest kit |
| POST | `/api/kits/:id/regenerate` | `{ target: "brief", confirm? }` or `{ target: "category", category }`; runs in the background, merges into the kit as it is then |
| POST | `/api/kits/:id/practice` | `{ itemId, confidence: 1-3 }` |
| POST | `/api/kits/:id/coach` | `{ itemId, answer }` → `{ covered, missed, improvement }` (D15) |

Middleware order: JSON body (200 KB) → JSON-only mutations → `requireUser` on `/api/kits` → routes → error handler.

## Frontend

Next.js 16 App Router (`web/src/app`), JavaScript, Tailwind 4, no component or state library. `cacheComponents` is on, so page files are thin server components that wrap one client component in `<Suspense>` (required for `useParams` / `useSearchParams` under prerendering); nothing in the root layout reads the URL, or every dynamic route would fail its prerender.

| Route | Screen |
|---|---|
| `/` | landing |
| `/login`, `/register` | one `AuthForm`; returns to `?next=` (same-site paths only); `?expired=1` shows "your session ended" |
| `/kits` | kit list: loading skeleton, empty state, error with retry, delete with confirmation |
| `/kits/new` | create form: field checks, draft kept in `sessionStorage`, duplicate dialog (open / create anyway / change days) |
| `/kits/[id]` | while generating: step-by-step progress (polled every 2 s), resume/try again; when ready: the builder (tabs: Questions, Requirements & coverage, Flashcards, Schedule, Company brief, Research) |
| `/kits/[id]/practice` | deck choice, one card at a time, confidence marks, answer coach, progress per requirement |

**Data flow.** `lib/api.js` is the only fetch: same-origin `/api/*`, errors become `ApiError { status, code, message, details }`, a 401 sends the user to sign in. `lib/use-kit.js` loads a kit, polls while the server works on it, and runs builder operations through a queue: each is previewed at once with `lib/local-ops.js`, sent with the current version, rolled back on failure, and replaced by the latest kit on `VERSION_CONFLICT`. A parity test (`api/test/preview-parity.test.js`) keeps the preview identical to the server's `applyOp`. Practice ordering and progress come from `shared/src/practice.js`, the same code the API tests.

**Interaction.** Inline edit (Enter or blur saves, Shift+Enter new line, Escape cancels); delete hides at once with a 5-second Undo; regeneration shows a banner while running and a summary when done; tabs follow the WAI-ARIA pattern (arrow keys) and become a select on phones; dialogs are native `<dialog>`; every control has a visible focus outline; practice shortcuts: Space reveals, 1/2/3 mark, ←/→ move.

## Rate limiting and failure handling

`api/src/llm/client.js` + `rate-limiter.js`. One limiter per model (D5: each Groq model has its own 8K tokens/minute budget), shared by every run in the process. Before a call it reserves an estimate (prompt chars ÷ 4 + max output tokens) in a sliding 60-second window, then settles to the real usage. 429 → wait for `retry-after`; 5xx and network errors → exponential backoff with jitter, at most 5 attempts; other 4xx fail at once. Invalid JSON or a schema miss → one repair retry with the error described, then `LLM_BAD_OUTPUT`. Page fetches: 10 s timeout, 2 MB cap, 3 attempts for transient failures, 1 request/second per host.

## Security

- **Untrusted text is data.** The posting, fetched pages, search results, and user-written kit text sent back to the model (regeneration avoid-lists, coach answers) are wrapped in `<untrusted_content>` with look-alike tags stripped; every system prompt carries the rule to treat them as data. Live test: injected instructions in a posting and on a company page left the kit unchanged.
- **Fetching (D6).** URLs are normalised and checked; private, loopback and link-local addresses are refused in production, re-checked on every redirect; HTML only, 2 MB cap, 10 s timeout, robots.txt respected.
- **Accounts (D10).** scrypt passwords; session tokens stored only as SHA-256; `httpOnly`, `SameSite=Lax`, `Secure` cookies; JSON-only mutations against CSRF; one message for wrong email or password.
- **Authorisation.** Every kit query includes the user's id; another user's kit is "not found".
- **Abuse limits.** One generating kit per user (database index), 10 new kits per day, 30 coach calls per hour, 200 KB bodies, length caps on every text field.
- **Secrets.** Keys and the database URI come from environment variables; logs never include passwords, tokens, cookies, request bodies or the posting.

## Deployment

_Pending._
