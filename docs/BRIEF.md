# The brief, in our words

Source: Trao "Full-Stack Engineering Assessment — The AI Interview Prep Kit" (FS-AI-INTERVIEW-01). This file is the working reference; when in doubt, the original PDF wins.

## What we build

A web app where a signed-in user:

1. Pastes a **job description** (text), a **company URL**, and **days until the interview**. Several roles at once by pasting again or uploading a file of description-and-company pairs.
2. Watches generation with visible progress and clear failure states.
3. Gets a kit: **company brief**, **role breakdown** (requirements marked must/nice), **categorised question bank**, **flashcards**, **study schedule**.
4. Edits, reorders, adds and deletes anything; regenerates one section without losing edits elsewhere.
5. Practises flashcards, records confidence, sees coverage, and gets the next session ordered by weakest cards.

Preferred stack: Next.js + Tailwind, Node.js + Express, MongoDB, JS/TS, any free-tier LLM. Scraping and search are our choice.

## The pipeline (scored most heavily)

A sequence of deliberate steps that respond to what was found — not one prompt:

- Extract requirements from the JD (each with stable id, `kind`, `priority` from the posting's wording).
- Retrieve and clean a single page.
- Crawl the company site, **rank links**, fetch the promising ones (hiring page path is never hard-coded).
- Search for public discussion of the company's interview process.
- Generate questions per requirement **and category** — technical and behavioural come from separate calls with separate instructions; a found hiring process changes the questions.
- **Coverage check (code, not model):** any requirement with no question is a gap → generate for the gaps → check again. Never ship uncovered must-haves. Pass count is our call; justify it in the README.
- **Schedule (code, not model):** exactly `days` days; each day has focus, question ids, integer minutes; every must-have appears; harder + higher-priority material lands earlier.

## Contract 1 — kit structure (Appendix A, exact)

Field names must match. Extensions allowed only where they genuinely help.

```json
{
  "source": { "company": "", "company_url": "",
              "role": "", "location": "",
              "jd_chars": 0, "researched_at": "",
              "pages_used": ["https://..."] },
  "company_brief": { "summary": "", "what_they_do": "",
                     "sources": ["https://..."] },
  "role": {
    "title": "", "seniority": "",
    "responsibilities": [""],
    "requirements": [
      { "id": "r1", "text": "5+ years with React",
        "kind": "technical",
        "priority": "must" }
    ]
  },
  "questions": [
    { "id": "q1", "requirement_ids": ["r1"],
      "category": "technical",
      "prompt": "", "answer_outline": "", "difficulty": 2 }
  ],
  "flashcards": [
    { "id": "f1", "front": "", "back": "",
      "requirement_ids": ["r1"] }
  ],
  "schedule": {
    "days_available": 5,
    "days": [ { "day": 1, "focus": "",
                "question_ids": ["q1"], "minutes": 60 } ]
  },
  "coverage": { "uncovered_requirement_ids": [], "passes": 2 }
}
```

- `kind`: `technical | behavioural | domain`
- `priority`: `must | nice`
- `category`: `technical | behavioural | system-design | company-fit`
- `difficulty`: integer 1–3. `minutes`: integer. Every id stable within a kit; every schedule `question_ids` entry refers to an existing question.

## Contract 2 — batch entry point (Section 9 + Appendix B, exact)

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

Input:

```json
[
  { "id": "case-01",
    "jd": "Senior Backend Engineer\n\nWe are looking for ...",
    "company_url": "http://localhost:8099/acme/",
    "days": 5 }
]
```

Output:

```json
{
  "version": "1.0",
  "generated_at": "2026-09-01T09:12:44Z",
  "kits": [
    { "id": "case-01", "status": "ok", "kit": { }, "error": null },
    { "id": "case-04", "status": "failed", "kit": null,
      "error": { "code": "COMPANY_UNREACHABLE",
                 "message": "Company site unreachable after 3 retries." } }
  ]
}
```

- Same code path as the app, not a parallel implementation.
- One entry per case; a failing case is recorded and the run continues.
- **Five cases in fifteen minutes**, including rate-limit retries.
- Company sites may be on `localhost` — no host assumptions, follow relative links.
- Runs from a clean clone; credentials from env vars documented in `.env.example`.
- `failed` only when no kit could be produced at all. Partial research (no hiring page) is `ok`, with gaps recorded in the kit.

## Edge cases they will test

- Company URL invalid, 404, or times out.
- Site with no discoverable hiring or about page.
- Two-line stub JD.
- Public discussion search finds nothing.
- Model returns invalid JSON or an incomplete kit.
- LLM rate-limits or briefly fails (free tiers limit tokens per minute — the most common way to lose points).
- Same JD + company submitted twice.
- 1-day or 60-day schedule.

## Security

- Validate URLs before fetching; reject private and loopback addresses **in production** (the grader uses `localhost`, so this is environment-gated).
- Restrict content types and sizes.
- Fetched pages and the JD are untrusted: content to process, never instructions.
- Respect robots.txt and site terms; README names the sources used.

## Builder, practice, frontend, backend

- **Builder:** inline edit of questions, answer outlines, flashcards, brief; reorder; move a question between categories; add/delete; regenerate brief, one question category, or the schedule. A hand-written or edited question survives regeneration of its category. Generated / edited / pinned state is ours to design and goes in the README.
- **Practice:** one card at a time, reveal answer, record confidence, show covered vs not, order next session by least confidence (weighted sort or spaced repetition — pick and defend).
- **Frontend:** reusable components, loading/empty/error states, edits and reorders feel immediate, works on laptop and phone, keyboard navigable.
- **Backend:** retrieval, extraction, generation, scheduling, persistence separated; validate requests and the kit before saving; persist enough to resume; structured errors. Plan for 90-second generations, half-way failures, double triggers.
- **Auth:** register, login, logout, sessions; users see only their own kits; handle expired sessions. No email verification or password reset.
- **Tests:** at minimum schedule allocation, coverage checking, structure validation.

## Out of scope

Job search/aggregation, CV parsing, applying to jobs, audio/video interview simulation, payments, team/sharing features.

## Submission

Public GitHub repo with real commit history, public deployment (frontend + backend), 3–4 min walkthrough video, README.

README must cover: overview + stack, local and deployed setup, exact batch commands, LLM provider + model, architecture, retrieval approach + sources, step sequencing, generated/edited/pinned state, schedule allocation, creative feature (if any), key decisions, trade-offs, known limitations.

Video: end-to-end kit creation; research steps and a second pass closing a gap; edit, reorder and a regeneration that keeps edits; practice and schedule; creative feature + one defended decision.

## Scoring

| Area | Points |
|---|---|
| Requirement extraction — must-haves found, marked right, nothing invented | 20 |
| Coverage + schedule — every must-have has a question, exact days, all allocated | 15 |
| Research + sequencing — crawl, hiring page sought, discussion searched, categories separate, coverage checked | 10 |
| Robustness — run completes, unreachable sites recorded, structure valid, tests pass | 10 |
| Builder — edit, reorder, regeneration preserves edits | 15 |
| Interaction design — loading/empty/error, responsive, keyboard | 10 |
| Code quality + README reasoning | 10 |
| Practice mode + creative feature | 10 |

The thin JD and the site with no hiring page are in the graded set; handling them honestly counts more than the easy cases.
