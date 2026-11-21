# InterviewCompass

Turn a job description into an interview prep kit you can trust, edit and practise.

Paste a posting, give the company's website and the days until the interview. InterviewCompass reads the posting (quoting every requirement word for word), researches the company and its hiring process, and builds a kit: a company brief, the role's requirements, a question bank in four categories, flashcards and a day-by-day schedule. You then shape it (edit, reorder, pin; regenerating never overwrites your work) and practise it, weakest material first, with an answer coach.

**Live:** _deployment link added after deploy (web on Vercel, API on Render)._

---

## Contents

- [Stack](#stack)
- [Run it locally](#run-it-locally)
- [Batch command](#batch-command)
- [LLM provider and models](#llm-provider-and-models)
- [Architecture](#architecture)
- [How a kit is built (step sequencing)](#how-a-kit-is-built-step-sequencing)
- [Retrieval and sources](#retrieval-and-sources)
- [Generated, edited and pinned](#generated-edited-and-pinned)
- [Schedule allocation](#schedule-allocation)
- [Practice and the creative feature](#practice-and-the-creative-feature)
- [Key decisions](#key-decisions)
- [Trade-offs and known limitations](#trade-offs-and-known-limitations)
- [Security](#security)
- [Testing](#testing)
- [How this was built](#how-this-was-built)

---

## Stack

| Part | Choice | Why |
|---|---|---|
| Web | Next.js 16 (App Router) + Tailwind CSS 4, JavaScript | Trao's preferred stack (D1); one design-token file drives the whole UI (D17) |
| API | Node.js ≥ 22.9 + Express 5, layered MVC (D18) | Generation takes 1–2 minutes, which suits a long-running process (D9) |
| Database | MongoDB (Atlas) through the official driver (D11) | A kit is one document; versioned saves are one atomic update |
| Shared | `shared/`: the kit contract (zod), practice ordering, quote highlighting | The pipeline, API and UI validate and compute with the same code |
| LLM | Groq, `openai/gpt-oss-120b` + `openai/gpt-oss-20b` (D5) | Free tier, OpenAI-compatible, two independent rate budgets |
| Search | Tavily (optional key) + Hacker News (D7) | Public discussion of interview processes |

npm workspaces (`web/`, `api/`, `shared/`, D2): one `npm install` at the root installs everything.

## Run it locally

Requirements: **Node.js 22.9 or newer**, a MongoDB connection string (a free [Atlas](https://www.mongodb.com/cloud/atlas/register) cluster works) and a [Groq API key](https://console.groq.com/keys).

```bash
git clone <this repo> && cd interview-compass
npm install
cp .env.example .env          # then fill in LLM_API_KEY and MONGODB_URI (TAVILY_API_KEY is optional)

npm run dev:api               # API on http://localhost:4000
npm run dev:web               # web app on http://localhost:3000 (proxies /api/* to the API)
```

Open http://localhost:3000, create an account and a kit. Every variable is documented in [`.env.example`](.env.example).

To try the company research without the internet, serve the bundled fixture sites and use `http://localhost:8099/acme/` (has an about page and a published hiring process), `/quiet/` (no hiring page) or `/inject/` (prompt-injection attempts) as the company website:

```bash
npm run fixtures              # http://localhost:8099
```

## Batch command

The exact entry point from the brief:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

- Input: a JSON array of `{ id, jd, company_url, days }`. Output: `{ version: "1.0", generated_at, kits: [{ id, status, kit, error }] }`.
- Cases run one after another (they share one model budget). A failing case is recorded with a code and the run continues; the output file is rewritten after every case, so an interrupted run still leaves finished cases on disk.
- `failed` only when no kit can be produced (empty posting, model service down). An unreachable site or a missing hiring page is still `ok`, with the gap recorded in `kit.research.notes`.
- Needs `LLM_API_KEY` (and optionally `TAVILY_API_KEY`) in the environment or `.env`. It does **not** need MongoDB.

The five bundled cases (full posting, two-line stub, unreachable site, prompt injection, 60-day schedule):

```bash
npm run fixtures &            # the cases point at http://localhost:8099
npm run evaluate -- --input api/test/fixtures/cases.json --output kits.json
```

Measured on the free tier: **5/5 ok in 377 s** (about 9K tokens per case), well inside the 15-minute budget.

## LLM provider and models

Groq through its OpenAI-compatible API with plain `fetch` (D5), JSON mode plus zod validation and one repair retry.

| Model | Used for | Why |
|---|---|---|
| `openai/gpt-oss-120b` | requirement extraction, question generation, gap passes | The steps that decide the score need the stronger model |
| `openai/gpt-oss-20b` | company brief, interview process, flashcards, answer coach | Large inputs, easier work |

Groq's free limits are **per model** (about 8K tokens per minute each), so two models are two budgets. The client paces calls in a sliding 60-second window per model, waits exactly as long as a `429`'s `retry-after` asks, retries 5xx and network errors with exponential backoff and jitter (5 attempts), and repairs malformed JSON once, including Groq's own `json_validate_failed` responses. Any OpenAI-compatible endpoint works by changing `LLM_BASE_URL` and the model names.

## Architecture

```
Browser ──► Next.js (Vercel) ──/api/* rewrite──► Express API (Render) ──► MongoDB (Atlas)
                                                   │
                                                   ├─ routes → controllers → services → models     (D18)
                                                   │                ▲
                                                   │                └─ views: exactly what leaves the server
                                                   └─ job runner ──► pipeline ──► Groq · company site · Tavily / HN
```

- **The browser only talks to the web app.** `/api/*` is proxied to the API, so the session cookie is first-party (D10).
- **API layers (D18).** Routes only wire URLs; controllers validate the request (`validators/`), call one service and answer with a `views/` shape; services hold the rules; models are the only code that queries MongoDB and declare their own indexes.
- **Generation is a background job (D12).** `POST /api/kits` returns `202`; the pipeline writes progress and each finished step's result into the kit document; the page polls it. A restart marks unfinished kits *interrupted*, and **Resume** continues from the saved steps instead of starting again.
- **The pipeline** (`api/src/pipeline/`) is one engine used by both the API's job runner and the batch command.

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## How a kit is built (step sequencing)

Each step uses what the earlier ones found. Steps marked **code** involve no model.

| # | Step | Who | What |
|---|---|---|---|
| 1 | Read the posting | strong model + **code** | Title, seniority, location, responsibilities, requirements. Every requirement must carry the exact words it came from; code checks the quote is really in the posting (ignoring case, punctuation and spacing) and that its numbers match, and **drops anything it cannot find**. |
| 2 | Research the website | **code** | robots.txt, sitemap, homepage; links scored by words in their address and text; up to 8 pages, two clicks deep, one request a second. |
| 3 | Search public discussion | **code** | Tavily and Hacker News, with the company name required next to a hiring word. |
| 4 | Company brief | fast model | Only from the pages fetched; says so plainly when nothing useful was found. |
| 5 | Interview process | fast model | Stages from hiring pages and discussion; "no published process" without a model call when there is nothing to read. |
| 6 | Choose question categories | **code** | Technical, behavioural, company fit always; system design for a published design round or a senior technical role. |
| 7 | Write questions | strong model | **One call per category**, each with its own instructions and only its requirements; rules for a take-home, live coding or values round are added only when that stage was found. |
| 8 | Check coverage, close gaps | **code** + strong model | Every requirement without a question gets a gap pass (one question each), at most three checks; a must-have still uncovered gets a plain, marked fallback question. |
| 9 | Flashcards | fast model | Knowledge cards; behavioural cards cover structure, never invented experience. |
| 10 | Schedule | **code** | See below. |
| 11 | Validate | **code** | The whole kit against the contract (field names, ids, references, exact days) before it is saved or written. |

Untrusted text (the posting, every page, every search result, user-written text sent back to a model) is wrapped as data with its own delimiters, and every prompt says to treat it as such. A live test with injected instructions in both the posting and the company's pages left the kit unchanged.

## Retrieval and sources

- **Fetching** (D6): `fetch` + cheerio. URLs are normalised (an address typed without a scheme is tried over https, then http); private, loopback, link-local and reserved addresses are refused in production (checked by range, so no IPv6 notation slips through) and re-checked on every redirect; HTML only, 2 MB cap, 10 s timeout, robots.txt respected, a bot user agent that names the app.
- **Which pages:** the homepage, then links scored by hiring words (careers, jobs, hiring, interview, handbook, join) and about words (about, company, team, engineering, culture), whole words only, with blog and news pages damped. Sitemaps add candidates the homepage does not link to.
- **Public discussion** (D7): Tavily (if `TAVILY_API_KEY` is set) and the Hacker News Algolia API. Searches are skipped for companies on private addresses, since a public search would only find unrelated companies.
- **Every source is recorded** in the kit: `company_brief.sources`, and `research.pages_tried` (used and skipped, each with its reason), `research.discussion_sources`, `research.interview_stages`, `research.notes`. The app's **Research** and **Job description** sections show them.

## Generated, edited and pinned

Every question, flashcard and brief field carries a **state** and an **origin** (D8):

| State | Meaning | On regeneration |
|---|---|---|
| `generated` | Written by the AI, untouched | May be replaced |
| `edited` | Changed by you (or written by you: `origin: user`) | Kept word for word, in place |
| `pinned` | Marked by you to keep exactly as it is | Kept word for word, in place |

- Editing a generated item makes it `edited`; unpinning restores the state from before the pin (an item edited while pinned returns to `edited`, never back to replaceable).
- **Regenerating a category** removes only that category's `generated` questions, asks for replacements (told which questions are kept and, separately, which ones you deleted), gives new questions **ids never used before**, and checks coverage again.
- **Deleting an AI question** records its prompt so a regeneration does not suggest it again.
- **The merge happens when the model finishes**, on the kit as it is then, so edits made meanwhile survive; every save carries a `version`, and a save from an older copy is refused and the latest kit reloaded (D13).
- **The brief** asks before replacing fields you edited; pinned fields are never replaced.

## Schedule allocation

Built in code, no model (`api/src/pipeline/schedule/allocate.js`):

1. Questions are ranked **must-have first, then hardest first**.
2. They are split into contiguous chunks across the study days, so harder and more important material lands early.
3. With 3 or more days, the **last day is review**; when there are more days than material, the extra days revisit must-have questions, three a day, hardest first.
4. Each day lists its question ids, a focus (the requirements its questions cover) and whole minutes: **10 / 15 / 20 minutes** for difficulty 1 / 2 / 3, plus 10 minutes of review. These are estimates, kept as named values.
5. Exactly the number of days requested (1–365). Every must-have appears on at least one day.

Changing the days or rebuilding the schedule in the app runs the same function.

## Practice and the creative feature

**Practice** (D14) goes one card at a time: reveal, then mark **Again**, **Unsure** or **Got it**. Each session is ordered by a weighted sort: least confident first (unseen counts as least confident), then must-have before nice to have, then the card practised longest ago. A spaced-repetition schedule spaces reviews over weeks, which does not fit a candidate with a few days. Progress per requirement shows what is covered and what is not yet.

**Creative feature: the answer coach** (D15). In practice you can type your answer before revealing. The fast model compares it with the answer outline and the requirements the question tests and returns what you covered, what you missed and **one** concrete thing to add. It never writes the answer for you. It turns "read and self-grade" into rehearsal.

The app also shows the **Job description** with every requirement highlighted where it was quoted from, so you can see how the posting was read.

## Key decisions

Each decision, the alternatives and the reasoning are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

| | Decision |
|---|---|
| D5 | Groq with two models: two independent per-minute budgets |
| D6, D7 | Retrieval by `fetch` + cheerio with links ranked in code; Tavily + Hacker News for discussion |
| D8 | Edit state as a label on every item; regeneration is a merge, not an overwrite |
| D9 | Vercel (web), Render (API), Atlas (database) |
| D10 | Server-side sessions in a first-party, httpOnly cookie through the web app's proxy |
| D12 | Generation as a background job with checkpoints and resume |
| D13 | Builder changes as typed operations applied by one pure function, with versioned saves |
| D14, D15 | Weighted practice order; the answer coach |
| D16 | Profile files in MongoDB, uploads checked by their bytes and served so they cannot run |
| D17 | An editorial visual system from one set of design tokens |
| D18 | Layered MVC API; the pipeline stays one engine |

## Trade-offs and known limitations

Tracked in [`docs/GAPS.md`](docs/GAPS.md):

- **Sites that need JavaScript to render** come back with little text; the kit says the research was thin rather than guessing (L1).
- **Public discussion is thin** for small companies, and without a Tavily key only Hacker News is searched (L2). Hacker News "Who is hiring?" threads can pass the relevance check as noise (L6).
- **Cold starts:** the free Render API sleeps when idle and takes about 50 seconds to wake; the app says so instead of hanging (L3).
- **DNS rebinding:** the private-address check resolves the host, then `fetch` resolves it again; closing that needs a custom HTTP agent (L4).
- **Pages over 2 MB are skipped** and recorded (L5).
- **A comma list of tools** under "you must be strong here" can become several must-haves: a defensible reading, left as is to keep extraction precise (L7).
- **No drag-and-drop:** move up / down and "Move to" work the same with a mouse, the keyboard and on a phone (L8).
- **The résumé is stored, never read:** the brief puts CV parsing out of scope.
- **One API instance:** the background jobs, rate limiter and coach limit live in one process; more instances would need a shared queue and limiter.

## Security

Reviewed with `/security-review` and `/code-review` (see [How this was built](#how-this-was-built)), then hardened for production (D19):

- **Accounts:** scrypt (N = 2^15) with per-user salts, upgraded at sign-in; server-side sessions in an httpOnly, SameSite=Lax, Secure cookie, stored only as a SHA-256; failed sign-ins throttled per email and per IP; one message for a wrong email or password.
- **Requests:** JSON-only mutations and a custom header on uploads (CSRF); zod on every body; ownership in every kit query; 200 KB bodies; file types checked by their bytes and served so they cannot run.
- **Fetching:** private, loopback, link-local and reserved addresses refused by range in production, re-checked on every redirect; robots.txt respected.
- **Model input:** posting, pages and user text wrapped as untrusted data; requirements kept only if quoted from the posting.
- **Responses:** security headers on the API and the web app, `no-store` on API data, an `X-Request-Id` on every response and error.
- **Operations:** a production server refuses to start misconfigured; `npm audit --omit=dev` reports 0 vulnerabilities.

Known limits: the web CSP has no script policy (L9); throttles live in one process (L10).

## Testing

```bash
npm test        # 258 tests: node:test, real throwaway MongoDB (mongodb-memory-server), fake model, local fixture sites
npm run lint    # web
```

- **Required by the brief:** schedule allocation (1, 5 and 60 days, front-loading, review days), coverage checking (gap loop, fallbacks, never-reused ids) and kit validation (shape, references, exact days).
- **Pipeline:** extraction's quote and number checks, link scoring, the private-address guard, robots, search relevance, every generation step with a fake model, checkpoints and resume.
- **LLM client:** pacing, `retry-after`, backoff, repair of malformed JSON (including Groq's `json_validate_failed`).
- **API over HTTP:** accounts and sessions, kits (double-click races, duplicates, limits, resume after a restart), builder operations and version conflicts, regeneration keeping edits, practice, the coach, profile files (a script renamed `.png` is refused; another user's files are not found).
- **Web/API agreement:** a parity test runs every builder operation through both the instant on-screen preview and the server and requires identical results.

The first test run downloads a MongoDB binary (about 77 MB) for the throwaway database; later runs reuse it.

## How this was built

Spec-driven, one phase at a time, with the agent skills in [`.claude/skills/`](.claude/skills/) guiding each stage:

| Skill | Stage | Produced |
|---|---|---|
| [`how-to-work`](.claude/skills/how-to-work/SKILL.md) | The workflow: explore → spec → plan → build, with an approval gate between each | — |
| [`explore-codebase`](.claude/skills/explore-codebase/SKILL.md) | Read the code before designing | `docs/specs/*/EXPLORATION.md` |
| [`write-spec`](.claude/skills/write-spec/SKILL.md) | The feature in plain words, with testable acceptance criteria | `docs/specs/*/SPEC.md` |
| [`implementation-plan`](.claude/skills/implementation-plan/SKILL.md) | Endpoints, data, files and phases | phase plans (kept local, not committed) |
| [`writing-for-agents`](.claude/skills/writing-for-agents/SKILL.md) | Documents agents read | [`AGENTS.md`](AGENTS.md), `CLAUDE.md` |
| [`pre-deploy-review`](.claude/skills/pre-deploy-review/SKILL.md) | Before deploying: run the built-in `/code-review` and `/security-review` over the whole codebase, confirm, fix test-first, record | [`docs/REVIEWS.md`](docs/REVIEWS.md) |

Before deploying, the whole codebase was reviewed with Claude Code's built-in skills:

| Skill | Found | Outcome |
|---|---|---|
| `/security-review` | 2 issues, each confirmed by a separate false-positive check: an IPv6 form that slipped past the private-address guard (high), and an open redirect after sign-in (medium) | Fixed with regression tests |
| `/code-review` | 9 issues: the same two, plus crash paths in background jobs and the crawler, a bypass of the untrusted-content wrapper, a way round the generation limits, a too-loose quote check, and a header encoding nit | Fixed with regression tests |

Every finding, how it was confirmed, the fix and its test: [`docs/REVIEWS.md`](docs/REVIEWS.md).

The documents they produced:

| Doc | What it holds |
|---|---|
| [`docs/BRIEF.md`](docs/BRIEF.md) | The assessment in our words, with the exact kit and batch formats |
| [`docs/specs/pipeline/`](docs/specs/pipeline/) | Exploration and spec for the kit pipeline and batch command |
| [`docs/specs/app/`](docs/specs/app/) | Exploration and spec for accounts, the builder, practice and the coach |
| [`docs/specs/profile/`](docs/specs/profile/) | Exploration and spec for the profile and account settings |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 18 decisions, each with the alternatives and the reason |
| [`docs/GAPS.md`](docs/GAPS.md) | Open questions as they were closed, and known limitations |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layout, pipeline, data model, API, frontend, security |
| [`docs/REVIEWS.md`](docs/REVIEWS.md) | The code and security reviews: findings, fixes and their tests |
