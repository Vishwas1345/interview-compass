# Profile — Exploration

**Feature in one line:** a signed-in user manages their profile (photo, name, job title, contact details, links, bio, résumé file) and account (email, password, deletion).
**Explored at:** `main` @ `43aa801`

## Where it lands

| What | File:line | Notes |
|---|---|---|
| Users collection | `api/src/db/mongo.js` (`email` unique index) | Holds `email`, `passwordHash`, `createdAt`. Profile fields are additive on the same document. [Certain] |
| Public user shape | `api/src/routes/auth.js:22` `publicUser` | `{ id, email, createdAt }`; returned by register, login and `/me`. Extending it puts profile fields wherever the session is known. [Certain] |
| Session store | `api/src/auth/sessions.js` | `create`, `lookup`, `destroy`; no "delete all but this one" yet (needed after a password change). Sessions carry `userId`. [Certain] |
| Password helpers | `api/src/auth/passwords.js` | `hashPassword`, `verifyPassword` (scrypt). [Certain] |
| Body parsing and CSRF rule | `api/src/app.js:18`, `api/src/http/middleware.js` `requireJson` | JSON only, 200 KB cap; non-JSON bodies get 415. File uploads need a binary body route that is exempt from `requireJson` but keeps CSRF protection another way. [Certain] |
| Kits per user | `kits` collection, `userId` index | Deleting an account must remove them too. [Certain] |
| Web session | `web/src/components/session.js` | Holds `user` from `/me`; the sidebar footer (`web/src/components/app-shell.js`) shows the email and Sign out. [Certain] |

## Pattern to follow

Auth routes (`api/src/routes/auth.js`): zod body schemas, `HttpError` with a code, `requireUser` for signed-in routes, tests in `api/test/auth.test.js` with `startTestDb` + `browser()` cookie jar.

## Constraints

- Brief: CV parsing is out of scope, so the résumé is stored and downloadable only (decided).
- Files are stored in MongoDB (decided): Atlas M0 has 512 MB in total, so size caps matter.
- Untrusted uploads: type must be checked from content, files served so the browser cannot execute them.
- Personal data (phone, email, CV): never logged.

## Open questions

None; the three decisions (résumé scope, storage, extra account actions) were answered on 2026-11-20.
