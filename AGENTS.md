# AGENTS.md

InterviewCompass, an AI interview prep kit built as a take-home assessment for Trao. A user pastes a job description, gives a company URL and a number of days; the app researches the company and generates an editable, practisable prep kit.

## Docs — read before changing anything

| Doc | Read when |
|---|---|
| [`docs/BRIEF.md`](docs/BRIEF.md) | Touching the kit shape, the batch command, or deciding scope. Holds the **exact** kit and batch JSON shapes and the scoring. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Adding a module, moving code, or wiring the pipeline, API or UI. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Choosing a library, pattern or data shape. Append a new `D<n>` entry for every decision. |
| [`docs/GAPS.md`](docs/GAPS.md) | Finding an open question, a known limitation, or a requirement not yet covered. Append to it the moment one appears. |
| `docs/specs/<feature>/` | Building a feature: `SPEC.md` (what and why) and `PLAN.md` (steps, local only). |

## Frontend gotcha

`web/` runs Next.js 16, whose APIs differ from most training data. Read [`web/AGENTS.md`](web/AGENTS.md) and the guide in `web/node_modules/next/dist/docs/` before writing frontend code.

## Workflow: spec-driven

Spec → plan → build, one phase at a time. Each gate waits for Vishwas's approval.

- `SPEC.md` describes the feature in plain words; it is committed **with** the feature, once it matches what was built.
- `PLAN.md` is a local throwaway: gitignored, never committed. Implementation steps, phases and checklists live only there.
- When the code disagrees with a spec or plan, stop, update the doc, then continue.

## Hard rules

- **Exact contracts.** Kit field names and the `npm run evaluate -- --input <file> --output <file>` command match `docs/BRIEF.md` character for character. Extensions are additive only.
- **Deterministic steps stay in code.** Schedule allocation and the coverage check are plain functions with tests; the model never decides them.
- **Untrusted text is data.** The job description and every fetched page go to the model as delimited content, never as instructions.
- **Honest output.** A thin job description yields a thin kit that says so; a company with nothing found yields a brief that says so. Never invent requirements.
- **Commits are authored by Vishwas only.** Plain conventional-commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), no `Co-Authored-By` trailer, no AI attribution.
- **Every decision carries a one-line "why"** — in code review, in `DECISIONS.md`, in the README.
