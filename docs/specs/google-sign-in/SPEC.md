# Google sign-in

**One line:** anyone can create an account or sign in with their Google account in two clicks, next to the existing email and password.

## Problem
Today the only way in is to make up and remember another password. A candidate who opens the app for the first time, often a reviewer clicking the live link, has to fill a form before seeing anything. Most of them already have a Google account and are signed in to it in the same browser.

There is a second, quieter problem: the app never checks that an email belongs to the person who typed it. Google sign-in is the first moment an email is actually proven, so it has to be handled carefully when that email already has an account.

## Who it is for
- **New visitors** (candidates, reviewers): want to try the app without inventing a password.
- **Returning Google users:** want to get back to their kits with one click.
- **Existing email and password users:** unaffected unless they choose Google with the same email (see rules).

## How they use it
1. On the sign-in or sign-up page, they click **Continue with Google**.
2. Google asks them to choose an account and, the first time, to allow the app to see their name and email.
3. They land back in the app, signed in, on the page they were heading to (their kits by default, or the page that sent them to sign in).

## How it works in the app
- **The normal case:** the app sends the visitor to Google, Google sends them back with a one-time code, and the app swaps that code with Google directly for the person's Google account id, email and name. The app then finds the matching account or creates one, and signs them in exactly as password sign-in does (same 7-day session, same sign-out).
- **First sign-in with Google, new email:** a new account is created. The profile name is filled from Google; everything else starts empty, as for any new account.
- **Returning Google user:** recognised by their Google account id, not by email. If their Google email has changed since, the account's email follows it, unless another account already uses the new one.
- **Email already has a password account:** the Google sign-in proves the email is theirs, so the account becomes a Google account. The old password is removed, every other signed-in device is signed out, and the person sees a one-time notice: "Your account now signs in with Google. Your old password no longer works."
- **Accounts without a password, on the profile page:**
  - the email is shown as managed by Google and cannot be edited here;
  - the password section says "You sign in with Google";
  - deleting the account is confirmed by typing the account's email instead of a password.
- **Errors** (the person always lands back on the sign-in page with a plain message and can try again or use email and password):
  - cancelled at Google: "Google sign-in was cancelled."
  - took longer than 10 minutes, or was started in another browser or tab: "That sign-in expired. Try again."
  - Google says the email is not verified: "Your Google account's email is not verified. Verify it with Google, or sign up with email and password."
  - Google unreachable or returns something unexpected: "Google sign-in is unavailable right now. Try again, or use email and password."
- **When Google sign-in is not set up** (no Google credentials configured, for example on a developer's machine): the button does not appear and everything else works as today.
- **Permissions:** the app asks Google only for the person's basic identity (name, email). It cannot read their mail, contacts or files.

## Rules & edge cases
- **Google's verified email is the proof of ownership.** *Why:* the app never verifies emails itself, so someone could have registered the address with a password first; removing that password on linking means a squatter cannot keep access to the real owner's kits and résumé.
- **A Google account is recognised by its Google id, not its email.** *Why:* the id never changes; an email can.
- **Unverified Google emails are refused.** *Why:* an unverified email proves nothing, and linking on it would hand over someone else's account.
- **Every sign-in round trip is single-use and expires after 10 minutes.** *Why:* it stops a forged or replayed return from Google signing someone into the wrong account.
- **Where to go afterwards is checked like today:** only a page on this site. *Why:* the existing open-redirect protection must not have a Google-shaped hole.
- **Password sign-in for a Google-only account** gives the usual "Email or password is incorrect." *Why:* a different message would reveal which emails have accounts.
- **Signing up with a password using an email that has a Google account** gives the usual "An account with this email already exists." (unchanged behaviour).
- **Old accounts** (made before this feature) are untouched until their owner chooses Google.
- **Two Google sign-ins at once** (two tabs): each is its own round trip; both end signed in to the same account.

## Impact
- **For users:** sign-up drops from a form with a password to two clicks; no new password to remember.
- **For the business:** a reviewer opening the live link can be inside the app in seconds, which is when they judge it.
- **On existing behaviour:** sign-in and sign-up pages gain one button; email and password work exactly as today. A password user who chooses Google with the same email loses the password (with a notice) and is signed out elsewhere.
- **On other features:** the profile page adapts for accounts without a password. Kits, the pipeline and practice are unchanged.

## Scope
**In:**
- Continue with Google on sign-in and sign-up.
- New Google accounts, returning Google users, and taking over a same-email password account as described.
- The profile page for accounts without a password (email managed by Google, password section, delete by typing the email).
- Clear error messages for every failure above; the button hidden when Google is not configured.
- A public privacy page, which Google requires before the app can be published for everyone.

**Out:**
- Connecting or disconnecting Google from the profile later: not needed to sign in, and it adds account-merging rules.
- Setting a password on a Google account: Google is enough to sign in; it would need its own re-confirmation step.
- Other providers (GitHub, Microsoft, Apple): one provider covers the need; the same design extends later.
- Using the Google profile photo: it would mean fetching and storing an outside image; people can upload one.
- Google's in-page one-tap prompt: it needs Google's script on every page and a loosened security policy.

## Acceptance criteria
- [ ] When Google is configured, the sign-in and sign-up pages show **Continue with Google**; when it is not, they do not.
- [x] A new visitor who chooses a Google account lands on their kits, signed in, with their Google name on the profile.
- [x] Signing out and back in with the same Google account opens the same account and its kits.
- [x] Signing in with Google from a page that required sign-in returns the person to that page.
- [x] A `?next=` pointing at another site sends the person to their kits instead.
- [x] A password account whose email matches the Google account becomes a Google account: the notice appears, the old password no longer signs in, and other signed-in browsers are signed out.
- [x] Cancelling at Google returns to sign-in with "Google sign-in was cancelled."
- [x] Returning from Google after 10 minutes, or with a tampered or reused return link, shows "That sign-in expired. Try again." and signs no one in.
- [x] A Google account with an unverified email is refused with the message above, and no account is created.
- [ ] For a Google-only account, the profile shows the email as managed by Google, the password section says "You sign in with Google", and deleting the account works by typing the email.
- [x] Password sign-in with a Google-only account's email shows "Email or password is incorrect."
- [x] The app's requests to Google ask only for name and email (shown on Google's consent screen).

**Verification (2026-11-21):** ticked criteria are covered by `api/test/google-sign-in.test.js` and `api/test/google.test.js` against a fake Google token endpoint (each protection also confirmed by removing it), and the first one was clicked through in a browser on a local harness. Still open: the button and profile screens checked by eye on every path, and every criterion on the live site with a real Google OAuth client.

## Open questions
None: the approach (our own server-side round trip with no new library), linking (Google wins, the password is removed, other devices are signed out) and the profile behaviour were settled with Vishwas on 2026-11-21.
