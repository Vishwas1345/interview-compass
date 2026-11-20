---
name: how-to-work
description: |
  How to build anything non-trivial with Vishwas: spec-driven development — explore, write a spec, plan the implementation, then build in phases. Never jump straight to code.

  TRIGGER when: Vishwas asks to build, add, implement, design, improve, refactor or rework a feature, endpoint, service, flow or behaviour; says "let's build X", "add support for X", "improve X", "how should we implement X"; or starts any change that needs a good code shape — more than one file, a new dependency, an API/schema/contract change, or more than one reasonable approach.

  SKIP for: a typo, a rename, an obvious one-line fix, a pure question, or a review. For those, state what you will do and why in one sentence, then do it.
---

# How to work with Vishwas — spec-driven development

Vishwas is an AI/ML & Backend engineer (backend engineering and system design first). He builds in a planned way, not by direct implementation. He learns while building, so he wants to see the thinking, not just the result.

**The rule: plan first, implement second. Never jump straight to code.**

## The flow

Every feature, improvement, or change that needs a good code shape goes through four steps, in order:

| Step | Skill | Output | Gate |
|---|---|---|---|
| 1. Explore | `explore-codebase` | `EXPLORATION.md` — where the work lands and which existing patterns to follow | none — go straight to step 2 |
| 2. Spec | `write-spec` | `SPEC.md` — the feature in plain words: what, why, how users use it, impact | **Vishwas approves the spec** |
| 3. Plan | `implementation-plan` | `PLAN.md` — endpoints, services, DB, middlewares, logic, in phases | **Vishwas approves the plan** |
| 4. Build | — | code, one phase at a time | Vishwas reviews each phase |

1. **Always explore first.** Load `explore-codebase`. Read the relevant service(s) until you know where the implementation belongs, how the codebase already solves similar problems, and what constraints apply. No design before this — a spec written without it describes a codebase that does not exist.
2. **Then write the spec.** Load `write-spec`. Describe the feature in plain words anyone can understand — the problem, who it is for, how they use it, how it behaves in the app, its impact. No code.
3. **Then plan the implementation.** Load `implementation-plan`. Turn the approved spec into concrete work: API endpoints, services and files touched, DB fields or collections, middlewares, logic — split into small phases that each ship and verify on their own.
4. **Then build, phase by phase.** Implement one phase, verify it, report it, then move to the next. Refer back to the plan at every step.

## Where the files live

`docs/specs/<feature-slug>/EXPLORATION.md`, `SPEC.md`, `PLAN.md` in the project being changed. If the project's `CLAUDE.md` or docs index defines a different home for design docs or plans, use that instead and follow its rules (for example, repos where plans are deleted once shipped).

If files for the feature already exist, read them first and continue from where they stopped — do not start over.

## How Vishwas likes it done

- **Simple first, then deeper.** Open with plain language; add low-level detail once the simple picture is set.
- **Every decision carries its "why"** — a library, a pattern, a data shape, skipping something: one line of reason each. Nothing anonymous.
- **Brainstorm with him, don't decide for him.** Where there is more than one reasonable approach, lay out 2–3 with cost, risk and where each breaks, then recommend one and say why.
- **Never over-engineer.** Cover the feature completely with the least machinery that does the job — no extra layers, abstractions, or future-proofing he did not ask for.
- **Keep him in the loop.** Wait at each gate. Planning is where he learns; do not compress it away.

## When reality disagrees with the plan

If implementation uncovers something the spec or plan got wrong — a missing field, a wrong assumption, a pattern that does not fit — stop, tell Vishwas, update the spec or plan, then continue. Never let the code silently drift from the documents.

## Skipping steps

Vishwas may skip a gate explicitly ("just build it", "skip the spec"). That is his call — note it in one line and continue. Never skip a step on your own because the change "looks small"; if it is genuinely trivial, this skill does not apply at all (see SKIP above).
