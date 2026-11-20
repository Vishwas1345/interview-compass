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
