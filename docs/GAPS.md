# Gaps

Open questions, known limitations, and requirements not yet covered. Add an entry the moment one appears; close it by linking the decision or commit that resolved it. The README's "known limitations" section is drawn from the open entries.

## Open questions

- ~~**G1 — Language.**~~ Closed by D3: JavaScript.
- ~~**G2 — LLM provider and model.**~~ Closed by D5: Groq, gpt-oss-120b (strong) + gpt-oss-20b (fast).
- ~~**G8 — Batch token budget.**~~ Closed by a timed run (2026-11-20): the 5 fixture cases (full posting, stub, unreachable site, injection, 60 days) finished 5/5 ok in 377 s, about 44K tokens in total (≈29K strong, ≈15K fast). Estimate was ~150K; real use is ~9K per case. No third model needed.
- ~~**G3 — Public-discussion search source.**~~ Closed by D7: Tavily (optional key) + Hacker News.
- ~~**G4 — Scraping approach.**~~ Closed by D6: `fetch` + cheerio, links scored in code.
- ~~**G5 — Repository layout.**~~ Closed by D2: npm workspaces `web/`, `api/`, `shared/`.
- ~~**G6 — Hosting.**~~ Closed by D9 and D21: Render free (web and API), Atlas M0.
- ~~**G7 — Edit-state model.**~~ Closed by D8: per-item `state`/`origin` labels, merge on regenerate, dismissed list, versioned writes.

## Known limitations

- **L1 — JavaScript-only sites.** Pages rendered only by client-side JavaScript come back with little text (no headless browser, D6). Recorded per page as "no readable text".
- **L2 — Public discussion is thin.** Without a Tavily key only Hacker News is searched; small or private companies usually return nothing, and the kit says so (D7).
- **L3 — Cold starts.** The Render free API sleeps after ~15 minutes idle; the first request takes ~50 seconds (D9). The UI shows a waking state.
- **L4 — DNS rebinding.** The URL guard resolves a host and checks its addresses, then `fetch` resolves it again; a hostile DNS server could answer differently the second time. Accepted for this scope: closing it needs a custom HTTP agent that pins the checked address.
- **L5 — Very large pages are skipped.** Pages over 2 MB are not read (e.g. posthog.com/careers on 2026-11-20); the skip is recorded, and the crawl moves on to the next-best page.
- **L6 — Hacker News "Who is hiring?" threads pass the relevance check.** They name the company next to a hiring word but are job listings, not interview discussion (seen for GitLab, 2026-11-20). They only add noise to the interview-process input; company pages outrank them. Fix candidate for polish: drop HN titles matching "who is hiring" / "who wants to be hired".
- **L7 — A comma list of tools can become several must-haves.** "AI / Agents: LangChain, LangGraph, CrewAI, custom orchestration" under "You Must Be Strong Here" became four must requirements, while "AWS / GCP / DigitalOcean" stayed one (seen on 2026-11-20). Each is a distinct skill and the heading makes them required, so this is a defensible reading; the cost is more must-haves to cover. Left as is: tuning the extraction prompt risks its precision, the highest-scoring step.
- **L8 — No drag-and-drop reordering.** Questions and flashcards are reordered with move up / move down buttons (and "Move to…" for categories). The buttons work identically with a mouse, the keyboard and on a phone; drag was first in the plan's cut order.
- **L9 — The web app's CSP has no script policy.** Next.js injects inline scripts, so `script-src` needs per-request nonces (middleware plus dynamic rendering). The shipped CSP blocks framing, plugins, `<base>` hijacking and off-site form posts; script injection is otherwise prevented by React's escaping (no `dangerouslySetInnerHTML` anywhere).
- **L10 — Throttles and limits live in one process.** Sign-in throttles, the coach limit and the LLM rate limiter are in memory: correct for one Render instance, reset by a restart, and they would need a shared store (Redis) before running more than one instance. `TRUST_PROXY_HOPS` must match the real proxy chain, or per-IP limits see the proxy's address instead of the client's.
- **L11 — Two free Render services sleep, and share free hours.** Each spins down after ~15 minutes idle, so a cold first visit waits for both to wake (up to about a minute); opening the site shortly before a review avoids it. Both draw on the workspace's 750 free instance hours a month, shared with other services there; if they run out, Render suspends every free service in the workspace until the month ends. Anyone calling the API's Render URL directly, instead of through the web app, can also set the first `X-Forwarded-For` entry the per-IP limits read; the per-email sign-in limit does not depend on the IP.
- **L12 — Google sign-in is one-way and Google-only.** A password account that signs in with Google becomes a Google account for good; Google cannot be connected or disconnected from the profile later, a Google account cannot set a password, and no other provider (GitHub, Microsoft, Apple) is offered. The profile photo is not taken from Google. Each was left out to keep the account rules simple (D22); the flow extends to another provider without changing sessions.
