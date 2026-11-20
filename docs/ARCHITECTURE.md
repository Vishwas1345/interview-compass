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

_Pending — brainstorm._

## Data model

_Pending — brainstorm. Includes how generated, edited and pinned state is represented._

## API

_Pending._

## Frontend

_Pending._

## Rate limiting and failure handling

_Pending._

## Security

_Pending._

## Deployment

_Pending._
