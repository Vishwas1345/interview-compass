---
name: write-spec
description: |
  Step 2 of spec-driven development (see `how-to-work`): after exploration, write SPEC.md — the feature in plain words anyone can understand: the problem, who it is for, how they use it, how it behaves in the app, and its impact. No code.

  TRIGGER when: exploration for a feature is done; Vishwas asks to "write a spec", "spec this out", "describe the feature", "what exactly are we building"; or you are about to plan an implementation and no approved spec exists.

  Needs EXPLORATION.md first. If it is missing, run `explore-codebase` before writing.
---

# Write the spec

**Goal:** one document that says exactly what is being built and why, in words a founder, a PM, a QA tester and an engineer all read the same way. The spec is the agreement; the plan and the code follow from it.

**Plain words only.** No file names, function names, endpoints, or table names — those belong in the plan. Name what the user sees and what the system does, not how it is wired. If a term needs a glossary, replace the term.

## Before writing

Read `EXPLORATION.md`. The spec must describe a feature that fits the codebase as it is — if exploration found the data already exists, or that a similar feature behaves a certain way, the spec follows that.

## Sections

Write to `docs/specs/<feature-slug>/SPEC.md` (or the project's own home — see `how-to-work`).

```markdown
# <Feature name>

**One line:** what it does, for whom, in one sentence.

## Problem
What is wrong or missing today, and who feels it. Use a concrete example.

## Who it is for
The users or roles, and what each one is trying to get done.

## How they use it
The user's journey, step by step, from where they start to the result they get.

## How it works in the app
What the system does at each step, in plain words. What the user sees:
- the normal case
- empty state (nothing to show yet)
- errors (what they see, what they can do next)
- permissions (who can and cannot, and what the others see)

## Rules & edge cases
The business rules the feature must follow, and the unusual cases:
limits, duplicates, concurrent use, deleted or missing data, old data created before this feature.

## Impact
- **For users:** what gets better, and by how much if it can be measured.
- **For the business:** why this is worth building.
- **On existing behaviour:** what changes for people already using the product — anything they will notice that is different from today.
- **On other features:** what else this touches or depends on.

## Scope
**In:** what this release includes.
**Out:** what it deliberately does not — each with one line of why.

## Acceptance criteria
Observable checks a tester can run without reading code. One line each, each one pass or fail:
- [ ] When <situation>, the user sees <result>.

## Open questions
Decisions still needed from Vishwas or others, each with a recommended answer and why.
```

## Writing rules

- **Concrete beats abstract.** "A team with 200 tests saves about 10 minutes per run" beats "improves efficiency".
- **Every rule states its reason** in one line — a rule without a why gets broken the first time it is inconvenient.
- **Acceptance criteria are testable.** "Works well" is not a criterion; "the score does not change when only suggestions change" is.
- **Out of scope is as important as in scope.** It stops the plan growing.
- **Do not invent numbers.** A figure that is an estimate says so.

## Gate

Show the spec to Vishwas and walk him through the open questions. **Do not start the plan until he approves it.** Write his answers back into the spec so it stays the single source of truth, then hand over to `implementation-plan`.
