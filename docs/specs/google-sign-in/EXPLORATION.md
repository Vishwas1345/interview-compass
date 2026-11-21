# Google sign-in — Exploration

**Feature in one line:** let people sign up and sign in with their Google account, next to the existing email and password.
**Explored at:** main @ b69ecf5

## Services involved
| Service | Role in this feature |
|---|---|
| `api/` (Express) | Talks to Google, decides which user is signing in, creates the session cookie |
| `web/` (Next.js) | "Continue with Google" button on sign-in and sign-up; profile adapts for accounts without a password |
| `shared/` | Home for pure helpers both sides need (today: kit contract, highlighting) |
| Google Cloud (external) | OAuth client: client ID, secret, allowed redirect URLs, consent screen |

## Where it lands
| What | File:line | Notes |
|---|---|---|
| Auth routes | `api/src/routes/auth.routes.js:4-10` | `register`, `login`, `logout`, `me`; new Google routes go here [Certain] |
| Auth controller | `api/src/controllers/auth.controller.js:9-12` | `startSession()` turns a user into the `ic_session` cookie; Google sign-in ends the same way [Certain] |
| Auth service | `api/src/services/auth.service.js:8-29` | Decides *who* the user is; controller owns cookies (comment at :1-2) [Certain] |
| User model | `api/src/models/user.model.js:9,15` | One index: `email` unique. Lookups by email and id; no provider id field [Certain] |
| Sessions | `api/src/services/session.service.js:18-23` | `create(userId)` → token; DB stores only its SHA-256 (D10) [Certain] |
| Cookie options | `api/src/utils/cookies.js:18-20` | httpOnly, SameSite=Lax, Secure in production, path `/` [Certain] |
| Public user view | `api/src/views/user.view.js:3-12` | No field says whether the account has a password [Certain] |
| Account actions | `api/src/services/account.service.js:9-12,14,25,31` | Change email, change password and delete account all require the **current password** (`checkPassword`); a passwordless user would be stuck [Certain] |
| Sign-in form | `web/src/components/auth-form.js:15-86` | One form for `/login` and `/register`; `?next=` handled by `safeNext` (:27) [Certain] |
| Redirect guard | `web/src/lib/safe-next.js:7-15` | Pure function; today web-only. A server-side redirect after Google needs the same rule in the API [Certain] |
| Profile page | `web/src/components/profile/profile-page.js:64,329-360,372-410,421-427` | Email, password and delete sections all ask for the current password [Certain] |
| Proxy | `web/next.config.mjs:24-26` | `/api/*` on the web domain is rewritten to the API; cookies set through it are first-party (D10, D21) [Certain] |
| Config | `api/src/config/index.js:2-21`, `productionProblems()` | Env-driven config with defaults, plus a production start-up check (D19) [Certain] |
| Composition root | `api/src/app.js:30,44-59` | Services built from injected deps (`jobs`, `coach`, `now`); external clients are injected, so tests pass fakes [Certain] |

## Pattern to follow
**Email sign-in, traced:** `POST /api/auth/login` → `requireJson` (`api/src/middlewares/json.middleware.js:11-14`) → `authRoutes` (`auth.routes.js:7`) → `controller.login` (`auth.controller.js:22-35`: zod `loginBody`, throttle check, `auth.login`) → `auth.service.login` (`auth.service.js:18-27`: `users.findByEmail`, scrypt verify) → `startSession` (`auth.controller.js:9-12`: `sessions.create` + cookie) → `publicUser` view → JSON.

Google sign-in follows the same layering: the controller handles the redirect and the cookie, a service decides the user, the model is the only code touching `users`. The difference is that it is two **GET** requests (go to Google, come back), not one POST; `requireJson` only checks POST/PUT/PATCH, so GETs pass untouched [Certain].

**External client injection:** `createApp({ db, jobs, coach, ... })` (`app.js:30`) receives the pipeline and the coach from outside; tests pass fakes. A Google client (token exchange) would be injected the same way, so no test talks to Google [Certain].

## Data
- `users`: `{ email (unique), passwordHash, createdAt, profile{…}, photo, resume, kitCreations }` (`user.model.js`, `auth.service.js:11`) [Certain].
- Missing: a stable Google account id (`sub`). Emails can change on Google's side; `sub` does not [Certain, from the OpenID Connect spec].
- `sessions`: unchanged; a Google sign-in creates the same session (`session.service.js:18-23`) [Certain].
- No email verification exists anywhere: anyone can register any email with a password (`docs/specs/app/SPEC.md:33,112`) [Certain]. This matters for linking (see pitfalls).

## Cross-cutting
- **Auth:** `signedIn` middleware for protected routes; `/api/auth/*` is open (`app.js:56`) [Certain].
- **Validation:** zod in `api/src/validators/` [Certain].
- **Errors:** `HttpError(status, code, message)` → JSON `{ error: { code, message, requestId } }` (`error-handler.js`) [Certain]. A redirect flow cannot show JSON to the user; errors must come back as a redirect to `/login?error=…` [Likely].
- **Throttling:** per email / per IP on password sign-in (D19); Google sign-in has no password to guess [Certain].
- **Security headers / CSRF:** SameSite=Lax cookie; JSON-only mutations (D10, D16). The OAuth round trip needs its own CSRF guard (`state`) [Certain, OAuth 2.0 spec].
- **Logging:** access log has method, path, status, id — never query strings (`request-id.middleware.js`), so the `code` from Google never lands in logs [Certain].

## Constraints & pitfalls
- **Untrusted input:** everything coming back from the browser (`code`, `state`, `next`) is untrusted; `next` must pass the same open-redirect rule as `safeNext` (review S2) [Certain].
- **No over-engineering** (CLAUDE.md): no auth framework replacing our sessions [Certain].
- **Exact contracts** (AGENTS.md): kit and batch shapes untouched; this is additive [Certain].
- **Account pre-hijacking:** since emails are never verified, someone can register `victim@gmail.com` with a password before the real owner. If Google sign-in later *links* to that account, the squatter keeps password access to the real owner's kits and résumé [Certain, known OAuth pitfall].
- **Google consent screen in "Testing"** only lets listed test users sign in; reviewers need it published. Basic scopes (`openid email profile`) do not need Google's verification review [Likely; confirm in the console].
- **Redirect URL must be the web domain** (`https://interview-compass.onrender.com/api/auth/google/callback`) so the cookie stays first-party through the proxy [Certain, D10/D21]. The API therefore needs to know the public web origin (new config) [Certain].
- **Proxied redirects:** the Next rewrite already passes `Set-Cookie` through (login works live); passing a `302` `Location` through unchanged is [Likely], to verify early.

## Tests
- `api/test/*.test.js`, `node:test`, real throwaway MongoDB, HTTP through `startTestApp` + `browser()` cookie jars (`api/test/helpers/app.js`) [Certain].
- Fakes for external services are injected into `createApp` (LLM, jobs) [Certain]; a fake Google token endpoint fits the same way.
- Web has no component tests; `safe-next.test.js` tests the pure helper [Certain].

## Parallel work
None: no open PR or commit mentions Google or OAuth (`gh pr list`, `git log`, grep of `docs/`).

## Open questions
1. How to sign in with Google: our own server-side flow, a library, or Google's client-side button?
2. Same email already has a password account: link, refuse, or link and remove the password?
3. Accounts without a password: what do change email, change password and delete account ask for instead?
4. Should a password user be able to connect Google later from the profile (or disconnect it)?
