# Pipeline — Exploration

**Feature in one line:** turn one case (job description, company URL, days) into a validated kit in the Appendix A shape, through separate research and generation steps, callable from both the batch CLI and the API.
**Explored at:** `main` @ `0a6c160`

Greenfield: no product code exists yet. This map records what the scaffold provides and which rules bind the pipeline.

## Services involved

| Service | Role in this feature |
|---|---|
| `api/` (`@interview-compass/api`) | Owns the pipeline code and the batch CLI [Certain] — `docs/DECISIONS.md` D2 |
| `shared/` (`@interview-compass/shared`) | Owns the kit contract; enums only so far [Certain] — `shared/src/index.js:4-8` |
| `web/` | Not involved; consumes kits later |

## Where it lands

| What | File:line | Notes |
|---|---|---|
| Batch entry point | `api/src/cli/evaluate.js:27-32` | Stub maps each case to `failed / NOT_IMPLEMENTED`; replace with a call into the pipeline. Arg parsing (`:9-19`) and envelope writing (`:34-35`) already match Appendix B [Certain] |
| Root command | `package.json:17` | `node --env-file-if-exists=.env api/src/cli/evaluate.js` — paths resolve from the repo root [Certain] |
| Pipeline steps | `api/src/pipeline/{retrieval,extraction,generation,coverage,schedule}/` | Empty folders [Certain] — `docs/ARCHITECTURE.md` repository layout |
| LLM client | `api/src/llm/` | Empty [Certain] |
| Kit schema | `shared/src/index.js:1-2` | Comment reserves this file for the full schema [Certain] |

## Pattern to follow

None in product code yet. The only trace is `GET /health`: `api/src/app.js:4-13` builds the app without listening so `api/test/health.test.js:5-8` can mount it on port 0. Keep the same split for the pipeline: pure functions callable from the CLI, the routes and tests, with no side effects at import time.

## Data

No persistence in this feature: the CLI writes a JSON file; MongoDB arrives with the API spec. Inputs and outputs are fixed by `docs/BRIEF.md` (Contract 1 and Contract 2) [Certain].

## Cross-cutting

- **Config:** env only, loaded by `--env-file-if-exists` (`package.json:17`); variables in `.env.example` — `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_MODEL_FAST`, `TAVILY_API_KEY`, `ALLOW_PRIVATE_URLS` [Certain].
- **Validation, errors, logging, rate limiting:** none exist yet [Certain].
- **Tests:** `node:test`, run by `node --test` (`api/package.json:11`) [Certain].

## Constraints & pitfalls

- Exact kit and batch shapes — `AGENTS.md` hard rules; `docs/BRIEF.md` Contracts 1 and 2.
- Schedule and coverage are deterministic code, never the model — `AGENTS.md`; brief Section 3.
- Same code path for CLI and app — brief Section 9; D2.
- Groq: 8K tokens/min and 1,000 requests/day **per model**; reasoning tokens count — D5. Five cases in 15 minutes — G8.
- Retrieval: `fetch` + cheerio, links scored in code, robots.txt, private-URL gate — D6. Search: Tavily + HN — D7.
- Extra fields (`state`, `origin`) allowed on items — D8.
- Grader sites may be on `localhost` with relative links — brief Section 9.

## Tests

`api/test/` with `node:test` + `node:assert/strict` (`api/test/health.test.js:1-3`). The brief requires tests for schedule allocation, coverage checking and structure validation.

## Parallel work

None: single-developer repo, 7 commits, all scaffold and docs (`git log`).

## Open questions

Settled in the spec: pass limit for the coverage loop; how questions are split across calls; minutes per question; honest-output wording for thin JDs and empty research; error codes for `failed` cases.
