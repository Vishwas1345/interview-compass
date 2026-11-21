---
name: pre-deploy-review
description: |
  Review the whole codebase before a deploy or a release with Claude Code's built-in `/code-review` and `/security-review`, confirm each finding, fix each one test-first, and record it all in `docs/REVIEWS.md`.

  TRIGGER when: Vishwas asks for a "code review", "security review", "review before deploy", "audit the codebase"; or the app is about to go public (a first deploy, making the repo public) and no review has run since the last large change.
---

# Pre-deploy review

**Goal:** every real issue in the codebase found, confirmed, fixed with a regression test, and written down, before strangers can reach the app. Both built-in reviews look at a *diff*; this skill makes the diff the whole project.

## 1. Run both reviews over everything

1. **Code review:** `/code-review medium api/src shared/src web/src` (paths make it a whole-file review when the tree is clean). Use `max`/`ultra` only if Vishwas asks.
2. **Security review** compares `origin/HEAD...HEAD`. Point `origin/HEAD` at the first commit, locally only, so the "changes" are the whole project:
   ```bash
   ROOT=$(git rev-list --max-parents=0 HEAD)
   git update-ref refs/remotes/origin/review-base "$ROOT"
   git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/review-base
   ```
   Run `/security-review`. Then restore, whatever the outcome:
   ```bash
   git remote set-head origin main && git update-ref -d refs/remotes/origin/review-base
   ```
   GitHub is never touched.

## 2. Confirm before fixing

- Each security finding gets its own false-positive check (the built-in's sub-task step); keep findings at confidence ≥ 8/10.
- Reproduce what can be reproduced (run the real module in `node -e`, trace framework code in `node_modules`).
- Judge the *diagnosis* and the *suggested fix* separately: a fix that breaks behaviour the reviewer could not see (real data, other checks) is replaced, and the reason recorded.

## 3. Record, then fix test-first

1. Write every finding to `docs/REVIEWS.md` (finding, location, severity, how confirmed, fix, status). **Leave it uncommitted until the fixes land**, so the history never holds an unfixed hole on its own.
2. Fix in order of risk (security → crashes → correctness → nits). For each: a regression test that **fails first**, then the fix, then the full suite.
3. When a fix touches a scored or data-dependent path, re-check it against real stored data, not only fixtures.
4. Mark each finding *Fixed* with its test, commit the fixes **with** `docs/REVIEWS.md`, and link it from the README.

## Done when

Every finding in `docs/REVIEWS.md` is *Fixed* (or *Accepted* with a reason in `docs/GAPS.md`), the suite passes, and `origin/HEAD` points at `origin/main` again.
