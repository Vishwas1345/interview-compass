# The InterviewCompass app

**One line:** a candidate signs in, turns a job posting and a company website into a prep kit, shapes the kit by hand without the AI undoing their work, and practises it until the interview.

## Problem

The pipeline produces a good kit, but only as a file from a command. A candidate preparing for an interview needs to see the kit, fix what the AI got wrong ("this question is too generic", "I already know Postgres, drop that"), get fresh questions for one area without losing the ones they rewrote, and then actually practise, with the weakest material coming up first. Today none of that exists, and nothing is saved between visits.

## Who it is for

- **A candidate** with an interview in a few days: wants a kit fast, wants to trust it, wants to tailor it, wants to practise on a laptop in the evening and on a phone on the way.
- **The reviewer at Trao:** will create kits, try to break the builder (edit, reorder, regenerate, double-click), check that their edits survive, and judge the loading, empty and error states.

## How they use it

1. **Sign up or sign in** with an email and a password.
2. **My kits:** a list of their kits (company, role, days, status, created). Empty on first visit, with a clear "Create your first kit" action.
3. **Create a kit:** paste the job posting, enter the company website, choose the number of days (1–365), press Generate.
4. **Watch it generate (about 1–2 minutes):** the page shows each step as it happens: reading the posting, researching the website (pages found), searching for interview discussion, writing the brief, reading the interview process, writing questions per category, checking coverage (and any second pass that closes a gap), flashcards, schedule. They can leave the page and come back; the kit keeps generating.
5. **Review the kit:** tabs for Brief, Requirements & coverage, Questions, Flashcards, Schedule, plus the research notes (what was found, what was not, and why).
6. **Shape it:** edit any question, answer outline, flashcard or the brief in place; reorder questions; move a question to another category; add their own questions; delete questions; pin items they want kept as they are.
7. **Regenerate a part:** the brief, one question category, or the schedule (including changing the number of days).
8. **Practise:** one card at a time; reveal the answer; mark how confident they felt; see which requirements they have practised well and which not yet; the next session starts with the weakest material.
9. **Sign out.**

## How it works in the app

### Accounts
- Sign up with an email and a password (at least 8 characters). The email is stored lower-case; a second account with the same email is refused with "An account with this email already exists."
- Sign in keeps them signed in on that browser for **7 days**, renewed while they keep using it. Sign out ends it at once.
- **Expired or missing session:** any page that needs an account sends them to sign in and, after signing in, back to where they were. An action that fails because the session expired says so ("Your session ended. Sign in again to continue.") rather than a generic error, and does not lose what they were typing in the create form.
- **Wrong email or password:** one message for both ("Email or password is incorrect") so the form does not reveal which emails have accounts.
- *Why:* the brief asks for register, login, logout, sessions and expired-session handling, and no email verification or password reset.

### Permissions
- A user sees, edits, regenerates, practises and deletes **only their own kits**. Asking for someone else's kit answers "not found", exactly as for a kit that does not exist. *Why:* "forbidden" would confirm the kit exists.

### Creating and generating a kit
- The form checks its inputs before sending: posting not empty (and at most 20,000 characters, matching what the pipeline reads), website present, days a whole number 1–365. Problems show next to the field.
- Generation runs **in the background on the server**. The page follows its progress and updates every couple of seconds. Closing the tab does not stop it.
- **Pressing Generate twice** (double-click, two tabs) never starts two generations: the second press joins the one already running.
- **Same posting and website submitted again** (later, on purpose): the app says "You already have a kit for this posting and company" and offers **Open it** or **Create a new one anyway**. If only the number of days differs, it also offers **Open it and change the days**, since a new schedule needs no new research. *Why:* the brief lists this edge case; regenerating everything costs a minute and the shared model budget for nothing.
- **When it finishes:** the kit opens. If parts of the research failed (no hiring page, site unreachable), the kit still opens, with the notes saying what was missing.
- **When it fails** (posting unreadable, model service down after retries): the kit shows *Failed* with the short reason and a **Try again** button.
- **When it stops half-way** (the server restarted, or the model service stayed down mid-run): the kit shows *Interrupted* with a **Resume** button. Resuming continues from the last finished step (the posting is not re-read, the website not re-crawled) rather than starting over. *Why:* the brief asks to "persist enough to resume" and plan for half-way failures.
- **The server is waking up** (the free host sleeps when idle): the app shows "Waking the server, this can take up to a minute" instead of a silent spinner.

### The builder
Every question, flashcard and brief field carries a label: **generated** (the AI wrote it, untouched), **edited** (the user changed it, or wrote it), or **pinned** (the user marked it to keep). Edited and pinned items are **protected**. The label shows on each item.

- **Edit in place:** click, type, save on leaving the field or with Enter (Escape cancels). Editing a generated item makes it *edited*.
- **Reorder** questions within a category with move up / move down buttons, which work the same with a mouse, the keyboard and on a phone. Reorder flashcards the same way. (Drag-and-drop was left out: the buttons cover every input, and drag was first in the plan's cut order.)
- **Move** a question to another category.
- **Add** a question (category, prompt, answer outline, difficulty, which requirements it covers) or a flashcard. It starts as *edited*.
- **Delete** a question or flashcard, with an Undo for a few seconds. A deleted AI question is remembered so regeneration does not suggest it again.
- **Pin / unpin** any item.
- **Changes feel immediate:** the screen updates at once and saves in the background. If a save fails, the change is rolled back and a message says why.
- **Two tabs editing the same kit:** a save based on an older copy is refused; the app reloads the latest kit and tells the user ("This kit changed in another tab; we loaded the latest version"). Nothing is merged silently.

### Regenerating a part
- **One question category:** protected questions in that category stay exactly as they are, in place. The AI's untouched questions in that category are replaced with new ones; the AI is told which questions are kept and which the user deleted, so it neither repeats nor resurrects them. New questions get new ids (an old id is never reused). Coverage is checked again in code, and a second pass closes any gap it opened.
- **The brief:** written again from the pages found during research. If the user edited the brief, the app asks first ("You edited this brief. Replace it anyway?"). Pinned fields are never replaced.
- **The schedule:** rebuilt in code from the current questions, for the current or a new number of days. No AI involved.
- **While a regeneration runs,** the user can keep editing other things; the result is merged into the kit as it is when the regeneration finishes, so edits made meanwhile survive.
- **After edits, the schedule may be out of date** (a question was deleted or added): deleted questions disappear from the schedule at once; a notice says "Your questions changed since this schedule was built" with **Rebuild schedule**.

### Coverage
- The Requirements & coverage tab lists every requirement (must or nice, kind, and the posting words it came from) with the questions that cover it.
- A must-have with no question (for example after the user deleted the only one) is shown as a **warning** with **Add a question** and **Regenerate this category**. The kit still saves. *Why:* the user is allowed to shape their own kit; the app's job is to make the gap visible, not to block the edit.

### Practice
- **Deck:** one day of the schedule (by default the first day with a question not yet marked Got it), or all questions, or all flashcards; the user picks. A session's order is fixed when it starts; the next session re-sorts with the new marks.
- **One card at a time:** the question (or flashcard front); **Reveal** shows the answer outline (or back). Then the user marks **Again**, **Unsure** or **Got it**.
- **Order of the next session:** least confident first, then must-have before nice, then the ones practised longest ago; unseen cards count as least confident. *Why:* see Decision 1.
- **Progress:** per requirement, how many of its cards are *Got it*, so the user sees covered vs not yet covered.
- **Keyboard:** Space reveals, 1 / 2 / 3 mark confidence, arrow keys move.
- Every mark is saved at once, so the next session, on any device, starts from the weakest cards.

### Creative feature: answer coach
In practice, the user can **type their answer** before revealing. The coach (fast model) compares it with the answer outline and the requirement the question tests, and returns: what the answer covered, what it missed, and one concrete improvement. It never rewrites the answer for them. *Why:* see Decision 2.

### What the user sees, by state
- **Loading:** skeletons for lists and the kit; step-by-step progress for generation; a spinner only on the button that was pressed.
- **Empty:** no kits yet; a category with no questions; no flashcards; nothing practised yet. Each says what to do next.
- **Errors:** a short message saying what happened and what to do; a field-level message for form problems; failures from the server keep their short code for support.
- **Phone and laptop:** every screen works at phone width; the builder's tabs become a menu.
- **Keyboard:** every action reachable by keyboard with a visible focus outline.

## Rules & edge cases

- **Limits per user:** one generation running at a time (a second Generate while one runs is refused with "You already have a kit generating"), and at most **10 new kits per day**. Regenerations count against the same shared model budget but not the daily kit cap. *Why:* the deployed app spends one shared free model budget; one person must not be able to use it all.
- **Many users at once:** generations share the model budget and queue behind each other; each page shows progress, so a slower kit is visible, not silent.
- **Deleting a kit** removes it entirely, after a confirmation.
- **A kit always stays valid in shape:** every save is checked against the kit contract (field names, ids, references). Only the coverage rules relax for user edits, as warnings.
- **Text limits:** a prompt or answer outline up to 2,000 characters; a flashcard side up to 500. *Why:* stops a pasted novel from breaking the layout or the model input.
- **User-written text is data** like the posting: when it is passed to the model (regeneration, answer coach), it is labelled as content, never as instructions.
- **Old data:** none: this is the first release with storage.
- **The batch command is unchanged:** it does not need an account or a database.

## Impact

- **For users:** a kit in about two minutes that they can trust (sources and notes), tailor without fighting the AI, and practise in short sessions that start with what they know least.
- **For the business (the assessment):** covers the builder (15 points), interaction design (10), practice and creative feature (10), and the auth, persistence and robustness parts of code quality.
- **On existing behaviour:** the pipeline gains a way to report each step's result for saving and to resume from saved steps; the batch output is unchanged.
- **On other features:** depends on the pipeline; the deployment (Vercel, Render, Atlas) follows this.

## Scope

**In:** accounts and sessions; kit list, create, generate with progress, resume, retry, delete; builder (edit, reorder, move, add, delete with undo, pin, regenerate brief / category / schedule, change days); coverage view with warnings; practice with confidence and progress; answer coach; loading, empty and error states; phone layout; keyboard use.

**Out:**
- Email verification and password reset: the brief excludes them.
- Sharing kits or teams: out of the brief's scope.
- Editing requirements: they come from the posting word for word; editing them would break "nothing invented". The user can still add questions for anything.
- Regenerating flashcards on their own: flashcards are cheap to edit and add by hand; regeneration targets in the brief are brief, one category, and the schedule.
- Login throttling and account lockout: no reset flow exists to recover a locked account; the free deployment is a demo.
- Offline use: practice needs the server.

## Acceptance criteria

- [x] A new user can sign up, is signed in, and sees an empty kit list with a "Create your first kit" action.
- [x] Signing in with a wrong password shows "Email or password is incorrect"; with an unknown email, the same message.
- [x] After signing out, opening a kit's address sends the user to sign in, then back to that kit.
- [x] User B opening user A's kit address sees "not found".
- [x] Creating a kit shows each pipeline step as it happens, including any coverage pass; closing and reopening the tab mid-way shows the same progress continuing.
- [x] Double-clicking Generate creates exactly one kit.
- [x] Submitting the same posting and website again offers "Open it" or "Create a new one anyway".
- [x] A kit whose website is unreachable opens normally, with a note saying the site could not be reached.
- [x] Stopping the server mid-generation and starting it again shows the kit as Interrupted; Resume finishes it without re-crawling the website (visible in the progress steps).
- [x] Editing a question's prompt shows it as *edited* immediately; reloading the page shows the edit kept.
- [x] After editing one technical question, pinning another and deleting a third, regenerating the technical category keeps the edited and pinned questions word for word and in place, replaces the other technical questions, and never brings back the deleted one.
- [x] Questions added by a regeneration have ids that never appeared in the kit before.
- [x] Reordering questions and moving one to another category survives a reload.
- [x] Deleting the only question for a must-have shows a coverage warning with "Add a question"; the kit still saves.
- [x] Regenerating the brief after editing it asks for confirmation first.
- [x] Changing the days from 5 to 1 and then to 60 rebuilds the schedule with exactly 1 and 60 days, without calling the AI.
- [x] Saving from a second tab with an older copy is refused, and the latest kit is loaded with a message.
- [x] In practice, cards marked Again come before cards marked Got it in the next session.
- [x] The practice progress shows, per requirement, how many of its cards are Got it.
- [x] The answer coach returns covered points, missed points and one improvement for a typed answer.
- [ ] Every screen works at 375 px wide, and every action can be done with the keyboard alone.
- [ ] Every list has an empty state, every server action has a loading state and an error state.

## Decisions (answered 2026-11-20)

1. **Practice ordering: weighted sort or spaced repetition?** → **Weighted sort.** *Chosen:* weighted sort (least confident first, then must-have first, then least recently practised). Spaced repetition schedules reviews days or weeks apart to build long-term memory; this user has a fixed, short horizon (often 1–7 days) and needs their weakest, most important material now. A weighted sort is also explainable in one line in the README and easy to test.
2. **Creative feature** → **Answer coach.** *Chosen:* answer coach (type an answer, get covered / missed / one improvement against the outline). It turns practice from "read and self-grade" into rehearsal, which is what an interview needs; it costs one small fast-model call per use. Alternatives considered: a per-requirement readiness map (useful, but close to the required "covered vs not" view); a timed mock-interview mode (mostly a timer, little new).
3. **Same posting submitted again: offer to open the existing kit, or always create a new one?** → **Offer to open it.** *Chosen:* offer to open it (with "Create a new one anyway"). It answers the brief's edge case visibly and saves a minute and model budget; the user stays in control.
4. **Limits per user: one generation at a time and 10 new kits per day?** → **Yes.** The deployed demo spends one free model budget shared by everyone (about 9K tokens per kit, 1,000 requests per day per model); without a cap one user can exhaust it for the reviewers.

## Open questions

None.
