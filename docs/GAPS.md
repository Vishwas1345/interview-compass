# Gaps

Open questions, known limitations, and requirements not yet covered. Add an entry the moment one appears; close it by linking the decision or commit that resolved it. The README's "known limitations" section is drawn from the open entries.

## Open questions

- ~~**G1 — Language.**~~ Closed by D3: JavaScript.
- ~~**G2 — LLM provider and model.**~~ Closed by D5: Groq, gpt-oss-120b (strong) + gpt-oss-20b (fast).
- **G8 — Batch token budget.** Groq's free tier is ~8K tokens/minute per model; an estimated ~150K-token 5-case run would take ~19 minutes on one model; two models (D5) bring it to an estimated ~9–10 minutes. Verify with a timed run; add `qwen/qwen3.8-27b` as a third budget only if needed.
- ~~**G3 — Public-discussion search source.**~~ Closed by D7: Tavily (optional key) + Hacker News.
- ~~**G4 — Scraping approach.**~~ Closed by D6: `fetch` + cheerio, links scored in code.
- ~~**G5 — Repository layout.**~~ Closed by D2: npm workspaces `web/`, `api/`, `shared/`.
- **G6 — Hosting.** Free-tier homes for frontend, backend and MongoDB. (Brainstorm.)
- ~~**G7 — Edit-state model.**~~ Closed by D8: per-item `state`/`origin` labels, merge on regenerate, dismissed list, versioned writes.

## Known limitations

- **L1 — JavaScript-only sites.** Pages rendered only by client-side JavaScript come back with little text (no headless browser, D6). Recorded per page as "no readable text".
- **L2 — Public discussion is thin.** Without a Tavily key only Hacker News is searched; small or private companies usually return nothing, and the kit says so (D7).
