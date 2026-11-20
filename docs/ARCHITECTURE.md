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

_Pending — brainstorm. Includes how generated, edited and pinned state is represented._

## API

_Pending._

## Frontend

_Pending._

## Rate limiting and failure handling

`api/src/llm/client.js` + `rate-limiter.js`. One limiter per model (D5: each Groq model has its own 8K tokens/minute budget), shared by every run in the process. Before a call it reserves an estimate (prompt chars ÷ 4 + max output tokens) in a sliding 60-second window, then settles to the real usage. 429 → wait for `retry-after`; 5xx and network errors → exponential backoff with jitter, at most 5 attempts; other 4xx fail at once. Invalid JSON or a schema miss → one repair retry with the error described, then `LLM_BAD_OUTPUT`. Page fetches: 10 s timeout, 2 MB cap, 3 attempts for transient failures, 1 request/second per host.

## Security

_Pending._

## Deployment

_Pending._
