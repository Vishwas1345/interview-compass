# Profile and account

**One line:** a signed-in user keeps a profile (photo, name, job title, contact details, links, bio and their résumé file) and manages their account (email, password, deletion) from one page.

## Problem

Today an account is only an email and a password. The candidate has no place to keep the details they use across applications: no name or photo in the app, no job title, nowhere to store the CV they send with applications, and no way to change their password or remove their account and its data.

## Who it is for

- **A candidate** who wants the app to feel like theirs, keep their current CV next to their prep kits, and stay in control of their data (change the password, delete everything).

## How they use it

1. In the sidebar, the bottom shows their photo (or initials) and name; clicking it opens **Profile**.
2. **Photo:** upload a picture, see it at once, replace or remove it.
3. **Details:** name, job title, phone, location, LinkedIn, website or GitHub, short bio; **Save**.
4. **Résumé:** upload a PDF; see its name, size and upload date; download, replace or remove it.
5. **Email:** change it, confirming with the current password.
6. **Password:** change it with the current password; other devices are signed out.
7. **Delete account:** confirm with the password; the account, every kit, every session and every file are removed, and they land on the home page signed out.

## How it works in the app

**Normal case.** The page has sections: Photo, Details, Résumé, Email, Password, Delete account. Each section saves on its own, so a mistake in one never loses edits in another. A saved section says so briefly.

**Photo.** JPEG, PNG or WebP, up to 1 MB. The image appears in the sidebar and on the profile page. Without one, initials (from the name, or the email) are shown.

**Résumé.** PDF only, up to 4 MB. The app stores the file and gives it back on download; **it never reads it** (the brief excludes CV parsing). A newer upload replaces the older one.

**Empty state.** A new account shows initials instead of a photo, "No résumé uploaded yet" with an upload button, and empty optional fields with short hints.

**Errors** (shown next to the section, nothing else is lost):
- a file of the wrong type: "Use a JPEG, PNG or WebP image" / "Use a PDF file";
- a file too big: "The photo must be 1 MB or smaller" / "The résumé must be 4 MB or smaller";
- a link that is not a web address: "Enter a full web address starting with http:// or https://";
- an email already used by another account: "An account with this email already exists";
- a wrong current password: "Your current password is incorrect";
- a session that ended: the usual "Your session ended" sign-in round trip.

**Permissions.** Only the signed-in user can see or change their profile and download their own photo and résumé. Asking for another user's files answers "not found".

## Rules & edge cases

- **Field limits:** name 80 characters, job title 100, phone 30 (digits, spaces and `+ ( ) - .` only), location 100, each link 300 (must start with `http://` or `https://`), bio 500. All optional. *Why:* bounded inputs, and links that are always safe to open.
- **File type is checked from the file's content, not its name.** A `.png` that is really something else is refused. *Why:* the name and the declared type are set by the sender.
- **Files are given back so the browser cannot run them:** with their checked type, "do not guess the type", and the résumé as a download rather than opened in the page. *Why:* an uploaded file must never become a script on our site.
- **Email change:** needs the current password; the new email must be valid and unused; stored lower-case like sign-up. No verification email (the brief excludes verification).
- **Password change:** needs the current password; the new one has at least 8 characters; every other session of that user is signed out, this one stays.
- **Delete account:** needs the password; removes the user, their kits, sessions and files; cannot be undone.
- **Personal data stays private:** phone, email, links and files are never written to logs, and are never sent to the model.
- **Storage:** photos and résumés live in the database, inside the user's record (decided). At 1 MB + 4 MB per user the free database holds roughly 100 users with both files; enough for the assessment, and a file service is the next step beyond that.
- **Old accounts:** users created before this feature simply have empty profile fields.

## Impact

- **For users:** their name and face in the app, their CV beside their kits, and control over their account and data.
- **For the assessment:** not a scored area; it rounds out the product and shows careful handling of uploads and personal data.
- **On existing behaviour:** sign-up and sign-in are unchanged; the signed-in user object gains profile fields; the sidebar footer shows the photo or initials and name.
- **On other features:** none of the kit, pipeline or practice behaviour changes.

## Scope

**In:** profile page; photo upload/remove; details form; résumé upload/download/remove; email change; password change; account deletion; sidebar identity.

**Out:**
- Reading the résumé (CV parsing): out of the brief's scope.
- Image cropping or resizing: the 1 MB cap keeps it simple; the browser scales the image.
- Verifying email or phone: the brief excludes verification.
- Several résumés or file history: one current CV is the need.
- A public profile: sharing is out of the brief's scope.

## Acceptance criteria

- [x] Clicking the name in the sidebar opens the profile page; a new account shows initials and empty optional fields.
- [x] Saving name and job title updates the sidebar without a reload; a reload shows the saved values.
- [x] A phone with letters, or a link not starting with http(s)://, shows a field message and is not saved.
- [x] Uploading a 600 KB PNG shows it in the sidebar and on the page; removing it shows initials again.
- [x] Uploading a 2 MB image or a text file renamed to .png is refused with the right message.
- [x] Uploading a PDF résumé shows its name, size and date; Download returns the same file; uploading another replaces it; Remove deletes it.
- [x] Another signed-in user requesting the first user's photo or résumé gets "not found".
- [x] Changing the email with a wrong password is refused; with the right password, signing out and in with the new email works.
- [x] Changing the password signs out a second browser, keeps the current one signed in, and the new password works.
- [x] Deleting the account with the right password removes its kits; signing in again fails; the old kit address is "not found".
- [ ] The profile page works at 375 px wide and by keyboard alone.

## Decisions (answered 2026-11-20)

1. **Résumé: store and download only.** The app never reads it, keeping within the brief's "CV parsing is out of scope".
2. **Storage: MongoDB,** inside the user's record, with 1 MB and 4 MB caps (4 MB, not 5: Vercel's proxy limits request bodies to about 4.5 MB). No new service on deploy day.
3. **Extras: change password, delete account, location and links, short bio.**

## Open questions

None.
