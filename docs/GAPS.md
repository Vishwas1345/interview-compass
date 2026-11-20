# Gaps

Open questions, known limitations, and requirements not yet covered. Add an entry the moment one appears; close it by linking the decision or commit that resolved it. The README's "known limitations" section is drawn from the open entries.

## Open questions

- ~~**G1 — Language.**~~ Closed by D3: JavaScript.
- ~~**G2 — LLM provider and model.**~~ Closed by D5: Groq, gpt-oss-120b (strong) + gpt-oss-20b (fast).
- ~~**G8 — Batch token budget.**~~ Closed by a timed run (2026-11-20): the 5 fixture cases (full posting, stub, unreachable site, injection, 60 days) finished 5/5 ok in 377 s, about 44K tokens in total (≈29K strong, ≈15K fast). Estimate was ~150K; real use is ~9K per case. No third model needed.
- ~~**G3 — Public-discussion search source.**~~ Closed by D7: Tavily (optional key) + Hacker News.
- ~~**G4 — Scraping approach.**~~ Closed by D6: `fetch` + cheerio, links scored in code.
- ~~**G5 — Repository layout.**~~ Closed by D2: npm workspaces `web/`, `api/`, `shared/`.
- ~~**G6 — Hosting.**~~ Closed by D9: Vercel, Render free, Atlas M0.
- ~~**G7 — Edit-state model.**~~ Closed by D8: per-item `state`/`origin` labels, merge on regenerate, dismissed list, versioned writes.

## Known limitations

- **L1 — JavaScript-only sites.** Pages rendered only by client-side JavaScript come back with little text (no headless browser, D6). Recorded per page as "no readable text".
- **L2 — Public discussion is thin.** Without a Tavily key only Hacker News is searched; small or private companies usually return nothing, and the kit says so (D7).
- **L3 — Cold starts.** The Render free API sleeps after ~15 minutes idle; the first request takes ~50 seconds (D9). The UI shows a waking state.
- **L4 — DNS rebinding.** The URL guard resolves a host and checks its addresses, then `fetch` resolves it again; a hostile DNS server could answer differently the second time. Accepted for this scope: closing it needs a custom HTTP agent that pins the checked address.
- **L5 — Very large pages are skipped.** Pages over 2 MB are not read (e.g. posthog.com/careers on 2026-11-20); the skip is recorded, and the crawl moves on to the next-best page.
