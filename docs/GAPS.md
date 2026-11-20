# Gaps

Open questions, known limitations, and requirements not yet covered. Add an entry the moment one appears; close it by linking the decision or commit that resolved it. The README's "known limitations" section is drawn from the open entries.

## Open questions

- ~~**G1 — Language.**~~ Closed by D3: JavaScript.
- ~~**G2 — LLM provider and model.**~~ Closed by D5: Groq, gpt-oss-120b (strong) + gpt-oss-20b (fast).
- **G8 — Batch token budget.** Groq's free tier is ~8K tokens/minute per model; an estimated ~150K-token 5-case run would take ~19 minutes on one model; two models (D5) bring it to an estimated ~9–10 minutes. Verify with a timed run; add `qwen/qwen3.8-27b` as a third budget only if needed.
- **G3 — Public-discussion search source.** Where "public discussion of the interview process" comes from, on a free tier. (Brainstorm.)
- **G4 — Scraping approach.** Plain HTTP + HTML parser, or a headless browser. (Brainstorm.)
- ~~**G5 — Repository layout.**~~ Closed by D2: npm workspaces `web/`, `api/`, `shared/`.
- **G6 — Hosting.** Free-tier homes for frontend, backend and MongoDB. (Brainstorm.)
- **G7 — Edit-state model.** How generated, edited and pinned state survive section regeneration. (Brainstorm.)

## Known limitations

_None recorded yet._
