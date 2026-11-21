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

> The web half is superseded by D21: both services run on Render.

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

---

## D13 — Builder writes are typed operations applied by one pure function

**Date:** 2026-11-20

**Decision:** Every builder change is `POST /api/kits/:id/ops` with `{ version, op }`. `op.type` is one of `updateQuestion`, `updateFlashcard`, `updateBrief`, `addQuestion`, `addFlashcard`, `deleteQuestion`, `deleteFlashcard`, `setPinned`, `moveQuestion`, `reorder`, `setDays`, `rebuildSchedule`. A pure `applyOp(state, op)` (`api/src/kits/ops.js`) applies the D8 rules: an edit marks a generated item `edited`; an item edited while pinned returns to `edited`, not `generated`, when unpinned; added items are `origin: user`; new ids come from per-kit counters, so ids are never reused; a deleted AI question's prompt joins that category's `dismissed` list; deleted questions leave the schedule at once and the schedule is marked stale; `coverage.uncovered_requirement_ids` is recomputed after every op. The route saves only if the stored `version` still matches (`updateOne({ _id, userId, version })`, `$inc: { version: 1 }`), otherwise 409 `VERSION_CONFLICT` with the latest kit. User-edited kits are validated with `coverage: "warn"`: structure and references stay strict, an uncovered or unscheduled must-have becomes a warning.

**Considered:** `PUT` of the whole edited kit, with the server diffing old and new to work out states.

**Why:** a diff has to guess intent (was this a move or an edit? a delete or a regeneration?) and would get the `dismissed` list wrong; a typed operation states it. One pure function makes every rule testable without HTTP or a database (12 tests), and the version check turns "two tabs, last write silently wins" into a visible reload. Warn mode follows the app spec: the user may delete the only question for a requirement; the builder shows the gap with a fix instead of refusing the save.

---

## D14 — Practice order: a weighted sort, not spaced repetition

**Date:** 2026-11-20

**Decision:** `orderDeck` (`shared/src/practice.js`, used by the API tests and the web app) sorts a session by: confidence ascending (unseen counts as least confident, then Again, Unsure, Got it), then must-have before nice, then the card practised longest ago, then the kit's order. Confidence, count and last-practised time are stored per card in the kit document's `practice` map, outside the kit itself, so recording practice never bumps the kit version or conflicts with builder saves.

**Considered:** spaced repetition (Leitner boxes or SM-2 intervals).

**Why:** spaced repetition schedules reviews days or weeks apart to build long-term memory; this user has a fixed, short horizon (often 1–7 days) and needs the weakest, most important material now, every session. A weighted sort is explainable in one line and testable without a clock simulation.

---

## D15 — Creative feature: the answer coach

**Date:** 2026-11-20

**Decision:** In practice, the candidate can type an answer before revealing the outline. `POST /api/kits/:id/coach` sends the question, the outline, the requirements it tests and the answer (the user-written parts wrapped as untrusted content) to the fast model, which returns `covered` (up to 4), `missed` (up to 4) and one `improvement`: a single sentence picking one missed point. It never writes a model answer. Limited to 30 calls per user per hour (in memory; one instance).

**Considered:** a per-requirement readiness map; a timed mock-interview mode.

**Why:** practice in the brief is "read the card, self-grade"; an interview needs rehearsal, saying an answer and finding out what it lacked. The readiness map overlaps the required "covered vs not" view, and a timed mode is mostly a timer. One small fast-model call (~1 second) per use fits the shared budget. Live tuning: the first prompt's "improvement" listed the whole outline, which hands the candidate the answer; it is now constrained to one missed point.

---

## D16 — Profile files live in MongoDB; uploads are raw bodies checked by their bytes

**Date:** 2026-11-20

**Decision:** The profile photo (JPEG, PNG or WebP, ≤ 1 MB) and résumé (PDF, ≤ 4 MB) are stored as binary inside the user's document. They are uploaded with `PUT` and the file as the raw body (no multipart library). Upload routes skip the JSON-only rule and instead require `X-Requested-With: InterviewCompass`, a custom header a cross-site page cannot send without a CORS preflight this API never grants. The file type is detected from the first bytes; the client's name and `Content-Type` are ignored. Files are served with the detected type, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-cache`; the résumé also with `Content-Disposition: attachment` and `Content-Security-Policy: sandbox`. The signed-in check loads users with the file bytes projected out. The résumé is stored and downloadable only: the app never reads it (the brief puts CV parsing out of scope).

**Considered:** Cloudinary or S3; Render's disk; multipart uploads with multer.

**Why:** MongoDB needs no new service on deploy day, and the caps keep the free cluster safe (~100 users with both files). Render's free disk is wiped on every deploy. A multipart form is exactly what a cross-site page can submit, so it would need the header guard anyway, plus a dependency. Checking bytes, not names, stops a renamed script being stored as an image; serving with `nosniff` and as an attachment stops any stored file running in our origin. 4 MB, not 5, because Vercel's proxy limits request bodies to about 4.5 MB. **Next step at scale:** object storage with signed URLs, confined to the profile routes.

---

## D17 — Visual system: editorial, from one set of tokens

**Date:** 2026-11-20

**Decision:** Warm paper background (`paper #F7F5F0`), near-black ink, one deep-green accent (`#1F5C4A`), hairline rules (`rule #E4E0D7`), warn and danger as muted ochre and brick. Newsreader (serif) for titles and figures, Geist for interface text, Geist Mono for numbering. Every colour and font is a token in `web/src/app/globals.css` (`@theme`); components use token names (`text-ink`, `border-rule`, `bg-accent`), never palette classes. Status and edit state are a dot or small capitals, not pills; notices are a coloured left rule, not a tinted box; lists are ruled rows, not stacks of cards; the brand is a wordmark, not a logo tile; icons are drawn SVG, never emoji.

**Considered:** a Swiss/minimal system (white, black, signal blue, all sans); a soft SaaS system (grey canvas, shadowed cards, teal).

**Why:** the first version leaned on defaults that read as machine-made: an indigo-to-violet gradient, colour on every element, emoji as icons, identical rounded cards. The kit is reading material (questions, outlines, a brief), and an editorial system serves reading: a serif for what you read, a sans for what you operate, one accent so the primary action is always obvious. Tokens make the system a single source of truth, so a new screen inherits it instead of inventing colours.

---

## D18 — The API is layered MVC; the pipeline stays one engine

**Date:** 2026-11-20

**Decision:** `api/src` is split by layer: `routes/` (URL → middleware → controller), `controllers/` (validate, call a service, send a view), `services/` (business rules), `models/` (the only MongoDB code, each owning its indexes), `views/` (the response shapes), `validators/` (zod request schemas), `middlewares/`, `utils/`, `config/`, `lib/llm/`. `app.js` is the composition root that builds them once. The pipeline (`pipeline/`) and the batch CLI are untouched by the layering.

**Considered:** per-feature modules (`modules/kits/{routes, controller, service, model, view}`); keeping the topic folders and tidying names.

**Why:** the route files had grown to hold validation, queries, rules and response shaping together (`routes/kits.js` was 317 lines). Layers give each concern one home and make the rules checkable by search (no `collection(` outside `models/`; no `views/` import in `services/`). With four resources, layer folders read more plainly than feature modules; that trade flips at around fifteen. The pipeline is an engine shared by the API job runner and the CLI, not a web concern, so splitting it across layers would scatter it. Views in an API are the "V": making them explicit keeps every outgoing field in one reviewable place, which is also a security boundary (no password hashes, file bytes or checkpoints leave). The refactor changed no behaviour: the 229 tests passed unchanged apart from one import path.

---

## D19 — Production hardening: throttles, request ids, security headers, scrypt cost

**Date:** 2026-11-21

**Decision:**
- **Sign-in throttling** (`services/throttle.service.js`): failed sign-ins are limited per email (10 in 15 minutes, from any IP) and per IP (50 in 15 minutes); sign-ups per IP (10 an hour). Only failures count, a success clears the email's count, and a refusal is `429 TOO_MANY_ATTEMPTS` with `Retry-After`. In memory, sliding windows.
- **Request ids** (`middlewares/request-id.middleware.js`): a safe incoming `X-Request-Id` is kept, otherwise a UUID; returned as a header, written on a one-line access log (method, path, status, time, id, a user id prefix; never bodies, cookies or query strings) and in every error body.
- **Security headers**: on the API, `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, `Cache-Control: no-store`, `CSP: default-src 'none'; frame-ancestors 'none'`, CORP same-site, and HSTS in production (file downloads keep their stricter headers). On the web app (`next.config.mjs`): framing denied, `nosniff`, a referrer and a permissions policy, HSTS, and a partial CSP (`frame-ancestors`, `base-uri`, `object-src`, `form-action`); no `X-Powered-By`.
- **scrypt cost** N = 2^15, r = 8, p = 1 (was Node's default 2^14). The hash records its parameters (`scrypt$N=32768,r=8,p=1$salt$hash`); the old format still verifies and is upgraded at the next sign-in.
- **Fail fast**: a production server refuses to start without `MONGODB_URI` or `LLM_API_KEY`, with `ALLOW_PRIVATE_URLS` on, or with a nonsensical `TRUST_PROXY_HOPS`.
- **`TRUST_PROXY_HOPS`** sets how many proxies front the API, so `req.ip` is the real client (2 in production: the web app's `/api/*` rewrite and Render's proxy, D21).

**Considered:** account lockout; a global per-IP request limit; `helmet`; a full CSP with nonces; OWASP's N = 2^17; bcrypt.

**Why:** the public deployment makes the sign-in form the first target, and the app spec ruled out lockout (no reset flow to recover a locked account), so a temporary throttle keyed by email is the protection that does not lock real users out. A global per-IP limit would lump users together behind shared proxies and buys little over the per-user limits already in place (one generation at a time, 10 kits a day, 30 coach calls an hour). The headers are a handful of lines, so a dependency was not needed. A script-src CSP needs per-request nonces in Next.js (inline scripts), recorded as L9. N = 2^17 needs 128 MB per hash, which would exhaust a 512 MB free instance under a few concurrent sign-ins; 2^15 is 32 MB, and the recorded parameters let it rise later without breaking existing accounts.

---

## D20 — CI on GitHub Actions; deploys only after CI passes, from the same workflow

**Date:** 2026-11-21

**Decision:** `.github/workflows/ci.yml` has two jobs. **ci** runs on every push and pull request: `npm ci`, lint, the full test suite (the throwaway MongoDB binary cached between runs), a production build of the web app, and `npm audit --omit=dev --audit-level=high`. **deploy** runs only for pushes to `main` and only after **ci** passed: it triggers the Render deploy hook (API) and builds and deploys the web app with the Vercel CLI, so both halves ship the commit that was tested. Each half skips with a notice until its secrets exist (`RENDER_DEPLOY_HOOK_URL`; `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). Vercel's own Git deploys are off (`web/vercel.json`), and Render's auto-deploy is set to off in its dashboard. Workflows get read-only repository permissions; deploys never overlap; Dependabot opens weekly update PRs that CI must pass.

> The deploy job's web half changed with D21: a second Render deploy hook instead of the Vercel CLI.

**Considered:** Render's and Vercel's native Git integrations deploying every push to `main`.

**Why:** Vercel's integration deploys whether or not the tests passed, so a red commit could reach production; deploying from the workflow makes "CI passed" the gate for both halves. Secrets live only in the deploy job, which runs only on `main` pushes, so a pull request (including one from a fork) cannot reach them. The batch command is not run in CI: it calls the paid model with real keys, and the pipeline is covered by the fake-model tests. **Cost we accept:** no per-PR preview deployments.

---

## D21 — Both services on Render; deploys by two deploy hooks

**Date:** 2026-11-21

**Decision:** the web app runs as a second Render free web service next to the API, in the same region: build `npm ci --include=dev && npm run build -w @interview-compass/web` from the repo root (the web app imports `shared`), start `npm start -w @interview-compass/web`, `API_ORIGIN` pointing at the API's Render URL. Auto-deploy is off on both services; the CI workflow's deploy job calls each service's deploy hook (`RENDER_DEPLOY_HOOK_URL`, `RENDER_WEB_DEPLOY_HOOK_URL`) after CI passes. `web/vercel.json` is removed. Live: web https://interview-compass.onrender.com, API https://interview-compass-api.onrender.com.

**Considered:** Vercel for the web app (D9's plan); Render's own "deploy after CI checks pass" setting instead of hooks.

**Why:** one platform and one dashboard for both halves, and one deploy mechanism (hooks) triggered from one job, so the API and the web app always ship the same tested commit. Nothing in the web app depends on Vercel: the `/api/*` rewrite runs in the Next.js server on any host, and `onrender.com` is a public suffix, so the two services are still separate sites and the first-party cookie through the rewrite (D10) is still the right design.

**Cost we accept:** the web service sleeps too, so a cold visit can wait for two wake-ups (up to about a minute); and both services draw on the workspace's shared 750 free hours a month (L11).

---

## D22 — Google sign-in: our own server-side OpenID Connect flow; Google's verified email wins

**Date:** 2026-11-21

**Decision:** "Continue with Google" next to email and password (spec: `docs/specs/google-sign-in/SPEC.md`). The API runs the authorization code flow itself, with no library: `/api/auth/google/start` sends the browser to Google with `state`, `nonce` and a PKCE S256 challenge, keeping the three secrets in a 10-minute httpOnly `ic_google` cookie; `/api/auth/google/callback` checks that cookie (single use), exchanges the code server to server (10 s timeout, no retry), checks the ID token's issuer, audience, expiry, nonce and `email_verified`, and starts the usual session. Accounts are matched by Google's `sub` (`users.googleId`, unique partial index). A password account with the same email becomes a Google account: its password is removed and its sessions end. Google accounts have no password, so their email and password are managed by Google, and deleting one is confirmed by typing its email. On only when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_ORIGIN` are all set; otherwise the button is hidden.

**Considered:** `openid-client` or `google-auth-library`; Google's in-page button posting an ID token (needs signature checks and Google's script under our CSP); Auth.js (replaces our sessions); on a same-email match, refusing, or linking and keeping the password.

**Why:** the ID token comes straight from Google's token endpoint over TLS with our client secret, so OpenID Connect Core 3.1.3.7 lets us skip signature checks, and the whole flow is about 150 lines that plug into the existing session (D10) and are tested against a fake token endpoint. The app never verifies emails, so anyone could register an address with a password first; Google's verified email is the first real proof of ownership, and keeping the old password on linking would let that squatter keep access (account pre-hijacking). The round-trip secrets live in a cookie rather than the database: nothing to clean up, and the browser cannot set it for someone else (httpOnly, and `onrender.com` is a public suffix). The callback URL is on the web origin, so the session cookie stays first-party through the proxy.

**Cost we accept:** a password user who signs in with Google loses the password (they are told once); connecting or disconnecting Google later, setting a password on a Google account, and other providers are not built (GAPS L12).
