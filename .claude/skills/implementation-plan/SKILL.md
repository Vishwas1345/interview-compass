---
name: implementation-plan
description: |
  Step 3 of spec-driven development (see `how-to-work`): turn an approved SPEC.md into PLAN.md — the concrete implementation in phases: API endpoints, services and files touched, DB fields or collections, middlewares, and logic, each phase shippable and verifiable on its own.

  TRIGGER when: Vishwas approves a spec; asks to "plan the implementation", "make an implementation plan", "break this into phases", "what do we need to build for X"; or you are about to write code for a feature that has a spec but no plan.

  Needs an approved SPEC.md and EXPLORATION.md. If either is missing, run the earlier step first.
---

# Plan the implementation

**Goal:** a plan concrete enough that building it is mostly typing — every endpoint, table, middleware and file named, split into small phases that each ship and verify on their own.

## Before planning

Read `SPEC.md` (approved) and `EXPLORATION.md`. The plan copies the patterns exploration found — cite them. A plan that invents a new pattern where one already exists needs a reason.

Also read the project's `CLAUDE.md` for obligations every change carries (for example: update the API spec with every endpoint, a migration convention, a required decisions log, the command to run checks). Those go into the phases, not into a footnote.

## 1. Choose the approach

Lay out 2–3 real approaches — not 10. For each: what it costs, what it risks, where it breaks. Then answer explicitly:

- **Recommended approach, and why.**
- **Scale:** what happens at 10× load or 10× data?
- **Security:** where is the trust boundary, what input is validated, what could leak?
- **Simplest version** that fully covers the spec — no extra layers or future-proofing.

## 2. Inventory every change

**API endpoints**

| Method | Path | Service | Auth / middleware | Request | Response | Errors | Idempotent? |

**Services & files touched**

| Service | File | Change | Why |

**Data**

| Store | New / changed | Fields & types | Indexes | Migration | Backfill for existing data? |

**Middlewares** — new or modified, and where in the chain they run.

**Core logic** — where each piece of business logic lives, described at the level of inputs → decisions → outputs, including the edge cases from the spec.

**Also, if they apply:** events or queues · config / env vars / feature flags · UI surfaces · background jobs · third-party calls (with timeout, retry and failure behaviour).

Omit a table that has no rows; write "none" rather than inventing work.

## 3. Split into phases

Order by dependency: data → logic → API → UI. Each phase is small, merges on its own, and leaves the system working.

For every phase:

```markdown
### Phase N — <goal in plain words>

**Endpoints:** …            **Middlewares:** …
**Data / migrations:** …    **Files:** …
**Logic:** what gets built, briefly.
**Tests:** each test and the bug it would catch — no padding.
**Verify:** the exact commands or checks that prove it works.
**Rollback:** how to undo it safely.
**Done when:** the acceptance criteria from the spec this phase satisfies.
```

## 4. Cross-cutting

- **Error handling:** transient vs permanent failures, retries with backoff, what the user sees.
- **Observability:** what gets logged, which metrics, how to tell it is working in production.
- **Security checklist:** authz on every new endpoint, input validation, no secrets or personal data in logs.
- **Rollout:** order of deploys across services, feature flag if needed, how old clients keep working.

## 5. Risks & open questions

What could go wrong, and anything still undecided — each with a recommendation.

## Writing rules

- **Every decision carries a one-line why** — an endpoint shape, a new field, a skipped index.
- **No speculative machinery.** If the spec does not need it, the plan does not build it.
- **Name real files and patterns** from exploration; mark anything new as new.
- **A phase that cannot be verified on its own is two phases, or not a phase.**

## Output and gate

Write to `docs/specs/<feature-slug>/PLAN.md` (or the project's own home — see `how-to-work`). Walk Vishwas through the approach choice and the phases. **Do not write code until he approves.**

Then build one phase at a time: implement, verify, report, move on. If reality contradicts the plan, stop, update the plan with Vishwas, then continue.
