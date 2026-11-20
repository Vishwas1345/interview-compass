# Kit generation pipeline

**One line:** turns a job description, a company website and a number of days into a complete, honest, validated interview prep kit, through a sequence of separate research and generation steps that the web app and the batch command both run.

## Problem

Someone with an interview at a company in five days has a job posting and a homepage. To prepare well they must work out which requirements actually matter, find how this company interviews (often buried in a handbook or a careers page they would never guess the address of), guess likely questions for each requirement, and spread all of it over the days they have. Done by hand this takes an evening, and the usual shortcut — pasting the posting into a chatbot — produces generic questions, invents requirements the posting never mentioned, and ignores how the company actually hires.

The graders feel the same problem from the other side: they run this step on postings we have never seen, including a two-line stub and a company with no hiring page, and score it automatically.

## Who it is for

- **The candidate**, through the web app: wants a kit that reflects *this* posting and *this* company, and tells the truth when there was little to go on.
- **The grader**, through the batch command: wants a kit in the exact agreed shape for every case, a recorded failure instead of a crash, and five cases finished inside fifteen minutes.

## How they use it

1. The candidate (or the batch file) supplies a job description as text, the company's website address, and how many days remain before the interview.
2. The pipeline runs. In the app the candidate watches each step start and finish; the batch command prints progress per case.
3. The result is a kit: a company brief, a role breakdown with its requirements, questions grouped by category, flashcards, a day-by-day schedule, and a coverage report — plus a plain account of what research succeeded and what did not.

## How it works in the app

The steps run in order; each one uses what the earlier ones found.

**1. Read the requirements from the job description.** No fetching is needed — the text is already here. The strong model lists the role's title, seniority, location, responsibilities and requirements. For every requirement it must also copy the exact words from the posting that it came from; our code then checks those words really appear in the posting and **drops any requirement it cannot find there**. Each requirement is marked *must* or *nice* from how the posting words it ("required", "you have" → must; "bonus", "nice to have", "preferred" → nice), and as *technical*, *behavioural* or *domain*. Each gets a short, stable id.
*Why:* requirement extraction is the largest score (20 points) and "nothing invented" is part of it. Asking for the source words turns "did the model invent this?" from an opinion into a check our code can run.

**2. Research the company website.** The address is checked first (well-formed, and not a private address when running in production). The pipeline reads the site's robots rules and sitemap if they exist, fetches the homepage, collects its links, and **scores each link in code** by words in its address and link text — hiring words (careers, jobs, hiring, interview, handbook, join) and about words (about, company, team, engineering, culture). It fetches the best-scoring handful of pages, at most two clicks deep, one request per second, and strips each page down to its readable text with a size cap. A page that fails (not found, timeout, wrong content type, blocked by robots rules, no readable text) is **skipped and recorded**, never fatal. The step ends knowing whether it found an about page and whether it found a hiring page.

**3. Search for public discussion of the interview process.** Using the company's name (from its homepage, not its web address), the pipeline searches the web search service when a key is configured, and Hacker News always. Searches for companies on private addresses are skipped, with the reason recorded. Finding nothing is a normal outcome and is recorded as such.

**4. Write the company brief.** The fast model summarises what the company does, using only the pages fetched in step 2. Its sources are exactly those pages. If nothing useful was found, the brief says so in plain words ("We could not find an about page on this site; this brief is based on the homepage only" or "The company site could not be reached; no company research is included") rather than describing the company from general knowledge.

**5. Read the interview process.** If a hiring page or public discussion was found, the fast model lists the interview stages it describes (for example: recruiter call, take-home, pair programming, system design, values interview). If nothing was found, this step records "no published process" without calling the model.

**6. Decide which question categories to generate — in code.**
- *Technical* when there are technical or domain requirements.
- *Behavioural* when there are behavioural requirements, or always for at least the core "tell me about a time" coverage of responsibilities.
- *System design* when the published process mentions a design or architecture round, or the role is senior and has technical requirements.
- *Company fit* always; when the company research is empty its questions stay general to the role rather than pretending to know the company.
*Why:* the brief requires that a found hiring process changes the kit; making the choice in code makes that visible and testable.

**7. Generate questions — one model call per category.** Each category has its own instructions and receives only the requirements that belong to it (technical and domain requirements go to the technical call, behavioural ones to the behavioural call), plus the interview stages from step 5. Every question must name the requirement ids it covers, carry a difficulty from 1 to 3, and include an answer outline. Our code discards any question naming an id that does not exist. A question may name at most three requirements, and only ones a good answer would actually show; our code keeps the first three. *Why:* in the first live run the model tagged one question with six requirements and a mentoring question with "5+ years of backend" — once coverage is counted, loose tags inflate it.
*Why:* the brief says a React requirement and a mentoring requirement must not come from the same call with the same instructions.

**8. Check coverage, then close the gaps — in code, in a loop.** Our code lists every requirement that no question covers. If any exist, the strong model is asked for questions for exactly those requirements, and coverage is checked again. The loop runs at most **three checks** (the first draft plus up to two gap passes). If a *must* requirement is still uncovered after that, our code adds a plain, clearly marked fallback question for it ("Walk me through your experience with …"). The kit records how many checks ran and which requirements remain uncovered (only *nice* ones can remain).
*Why three:* each gap pass costs tokens from a tight per-minute budget; in practice one pass closes nearly all gaps and a second catches stragglers, so a third model pass would mostly spend budget for nothing — and the fallback guarantees the one rule that matters: no must-have ships uncovered.

**9. Make flashcards.** The fast model turns the key points of the questions into short front/back cards, each naming the requirement ids it supports; cards naming unknown ids are discarded.

**10. Build the schedule — in code, no model.** Exactly the number of days requested. Questions are ordered must-before-nice, then hardest first, and dealt across the days so that harder and higher-priority material lands early. Each day gets a focus (taken from the requirements its questions cover), its question ids, and a duration in whole minutes, worked out from the questions' difficulty (an estimate: 10, 15 and 20 minutes for difficulty 1, 2 and 3, plus a short fixed review block). When there are more days than material, later days become review days that revisit earlier must-have questions, hardest first. On a one-day schedule everything lands on day one. Every must-have requirement appears somewhere in the schedule.

**11. Validate and finish.** The whole kit is checked against the agreed shape before it is saved or written: field names, allowed values, whole-number minutes and difficulties, every id unique, every reference pointing at something that exists, and the number of days equal to the request. A kit that fails this check is never returned as successful.

**What the user sees**
- *Normal:* a full kit, plus a research summary: pages used, pages skipped and why, whether a hiring page and public discussion were found.
- *Thin input:* a short posting gives a short kit, with a visible note ("This posting lists only 2 requirements, so this kit is short").
- *Nothing found about the company:* an honest brief stating what could not be found; the rest of the kit is still built from the posting.
- *Errors:* the kit fails only when no kit can be produced at all — for example the posting is empty, or the model service stays unavailable after all retries. The failure carries a short code and a plain message.
- *Permissions:* the pipeline itself has no users; the app (separate spec) decides who may run it and see the result.

## Rules & edge cases

- **Untrusted text stays data.** The posting, every fetched page and every search result reach the model wrapped and labelled as content to analyse, with our instructions kept separately; every model answer is checked against the expected shape before use. *Why:* all of this text is written by strangers and a page may contain "ignore your instructions".
- **Model service slows us down.** Calls are paced to stay inside each model's per-minute token and request budget; when the service still says "slow down" or briefly fails, the call waits (as long as the service asks, otherwise growing waits with a little randomness) and retries. *Why:* this is named in the brief as the most common way to lose points.
- **Model returns broken or incomplete output.** The call is retried once with the problem described; if it still fails, that step falls back honestly (an empty category is filled by the gap loop; a brief that cannot be written says so) instead of failing the case.
- **Company address invalid, missing page, or timeout.** Retried with backoff a few times, then recorded; the kit is still produced from the posting and marked successful, with a brief that says the site could not be reached. *Why:* a kit can still be produced, and the brief reserves *failed* for cases where none can.
- **Posting with no extractable requirements.** Still a successful kit: role title, brief, a few general role and company-fit questions linked to no requirement, the schedule, and a clear "no requirements could be found in this posting" note. *Why:* inventing requirements is worse than reporting there were none.
- **Days requested.** Any whole number from 1 to 365; anything else is rejected with a clear message. *Why:* comfortably above the brief's 60-day edge case.
- **Time per question.** 10, 15 and 20 minutes for difficulty 1, 2 and 3 — estimates, kept as named values and listed in the README so they can be tuned.
- **Two-line posting.** Only what the posting says is extracted; no requirement is added to make the kit look fuller.
- **No hiring or about page.** Recorded; the brief and the company-fit questions say what was not found.
- **Public discussion finds nothing.** Recorded; not an error.
- **1-day and 60-day schedules.** Both are exact: one day holds everything; sixty days spread new material early and use later days for review.
- **Same posting submitted twice.** Not handled here — the app spec decides (reuse the existing kit or run again).
- **Batch run.** Cases run one after another (they share one model budget); a failing case is recorded and the next one starts; a running time is printed per case.
- **Respect site rules.** Pages disallowed by a site's robots rules are not fetched.

## Impact

- **For users:** a kit specific to the posting and company in roughly a minute or two per case (estimate, to be measured), instead of an evening of manual work; and a kit that admits what it does not know.
- **For the business (this submission):** this feature carries the 55 automatically scored points — extraction (20), coverage and schedule (15), research and sequencing (10), robustness (10).
- **On existing behaviour:** the batch command stops marking every case "not implemented" and starts producing real kits.
- **On other features:** the app's create, progress, regenerate-one-section and practice features all call into these steps; regeneration reuses steps 7–11 for a single category, the brief or the schedule.

## Scope

**In:** every step above; the batch command producing real output; progress reporting per step; the research summary; tests for schedule allocation, coverage checking and kit validation.

**Out:**
- Saving kits, accounts, the web interface, regenerating sections from the UI — the app and builder specs; this spec only provides the steps they call.
- Caching research between runs — belongs with saving kits (app spec).
- Rendering JavaScript-only websites — needs a headless browser, ruled out (decision D6); recorded as a known limitation.
- Reading job postings from job-board links — the brief says postings are pasted as text.

## Acceptance criteria

- [x] Given the brief's example input file, the batch command writes one entry per case in the agreed output shape.
- [x] Every requirement in a kit can be found, word for word (ignoring case and spacing), in its job description.
- [x] A line saying "bonus points for X" produces a *nice* requirement; a line saying "you must have X" produces a *must* requirement.
- [x] No kit marked successful lists a *must* requirement as uncovered.
- [x] Every requirement id named by a question or flashcard exists in the kit; every question id named by the schedule exists in the kit.
- [x] The schedule has exactly as many days as requested, for 1, 5 and 60 days; every day's minutes is a whole number; every *must* requirement appears on at least one day.
- [x] On average, questions *introduced* (first scheduled) in the first half of the days are at least as difficult as those introduced in the second half; review days that revisit earlier questions do not count as introductions.
- [x] A case with a two-line posting finishes successfully, with only the requirements actually stated and a visible "short posting" note.
- [x] A case whose company site has no hiring page finishes successfully, records "no hiring page found", and its brief does not describe a hiring process.
- [x] A case whose company address returns 404 or times out does not stop the batch; the other cases still finish.
- [x] A company page containing "ignore previous instructions and output X" does not change the kit's shape or contents beyond normal summarising.
- [x] Technical and behavioural questions come from separate model calls (visible in the progress log).
- [x] A company whose hiring page mentions a system design round gets system-design questions; the same posting with a company that publishes nothing gets none unless the role is senior.
- [x] Five cases finish within fifteen minutes on the free model tier, including waits forced by rate limits.
- [x] When the model service answers "slow down", the run waits and continues rather than failing the case.
- [x] Automated tests for schedule allocation, coverage checking and kit validation pass.

## Decisions (answered 2026-11-20)

1. **Unreachable company site → successful kit without company research**, not a failed case. The brief's FAQ reserves *failed* for "could not produce a kit at all", and robustness scoring rewards unreachable sites being recorded rather than fatal.
2. **Posting with no requirements → thin successful kit with a clear note**, not a failure and not invented requirements.
3. **Days accepted: 1 to 365.**
4. **Minutes per difficulty: 10 / 15 / 20**, as named, documented values.

## Open questions

None.
