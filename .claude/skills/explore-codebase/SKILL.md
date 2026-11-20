---
name: explore-codebase
description: |
  Step 1 of spec-driven development (see `how-to-work`): explore the relevant service code before designing anything — find where the implementation belongs, the existing patterns to follow, and the constraints — and write it down as EXPLORATION.md.

  TRIGGER when: `how-to-work` starts a feature or improvement; Vishwas asks to "explore", "look into", "understand how X works", "find where X should go", or "gather context" before building; or you are about to write a spec or plan and have not yet read the code it will change.

  Read-only: never edits product code.
---

# Explore the codebase

**Goal:** know the codebase well enough that the spec and plan describe *this* codebase, not a generic one. By the end you can answer: where does this feature land, which existing feature does it look like, and what must it not break?

Read, don't edit. Facts only — no design yet; that is the spec's job.

## Steps

1. **Restate the feature** in one or two plain sentences. If you cannot, ask Vishwas before reading anything.

2. **Read the rules first.** The project `CLAUDE.md`, the owning service's `CLAUDE.md`, and any design doc, decisions log, or pitfalls file they point to for this area. These hold constraints the code alone will not show (for example: "no business logic in the gateway", "every endpoint needs an idempotency key").

3. **Find the owning service(s).** Use the project's service map if it has one. A feature that crosses services needs every one of them explored, not just the first.

4. **Trace the closest existing feature end to end.** Pick the feature most like this one and follow one request all the way through: route → middleware → handler/controller → service → repository → model/table → response. This is the pattern the new work should copy. One real trace beats skimming twenty files.

5. **Map the data.** Which tables/collections are involved, their fields, indexes, and migrations. Where the data this feature needs already exists — it often does, under a different name.

6. **Map the cross-cutting pieces** the feature will pass through: auth and permissions, input validation, error format, logging, idempotency, rate limiting, events/queues, config and feature flags.

7. **Find the tests** for the area: where they live, what style (unit vs e2e), what helpers and fakes exist.

8. **Check for parallel work.** Search open and recently merged PRs and recent commits on the main branch for the same topic. If someone is already building it, stop and tell Vishwas.

## Verify, don't assume

- **Cite `file:line` for every claim.** An uncited claim is a guess.
- **"I didn't find it" is not "it doesn't exist."** A search for one name proves only that name is absent — the data may live under another name or one layer up. Before writing "we don't have X", search by meaning, not just by name, and follow the data from where it enters the system.
- Tag each claim `[Certain]` (read it in code), `[Likely]` (strong inference), or `[Guessing]`.

## Output — `EXPLORATION.md`

Write to `docs/specs/<feature-slug>/EXPLORATION.md` (or the project's own home for design docs — see `how-to-work`). Keep it a map, not an essay:

```markdown
# <Feature> — Exploration

**Feature in one line:** …
**Explored at:** <branch> @ <commit>

## Services involved
| Service | Role in this feature |

## Where it lands
| What | File:line | Notes |

## Pattern to follow
The closest existing feature, traced end to end, with file:line at each hop.

## Data
Tables/collections, fields, indexes this touches or reads; what already exists vs what is missing.

## Cross-cutting
Auth · validation · errors · logging · idempotency · events — how each is done here today.

## Constraints & pitfalls
Rules from CLAUDE.md / design docs / pitfalls that apply, with a pointer to each.

## Tests
Where they live, style, reusable helpers.

## Parallel work
Related PRs or commits, or "none found" with the searches run.

## Open questions
What exploration could not answer — to settle in the spec.
```

## Done when

You can name, with `file:line`, where each part of the feature goes and which existing code it copies. Then hand over to `write-spec`.
