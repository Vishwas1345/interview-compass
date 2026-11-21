# Reviews

Reviews run on the whole codebase on 2026-11-20 (everything since the first commit), with Claude Code's built-in `/code-review` (medium) and `/security-review`. Each security finding was confirmed by a separate false-positive check (confidence 9/10 for both). Status: **all fixed on 2026-11-21, before deploy**, each with a regression test that failed before the fix and passes after (248 tests in total).

## Security review

| # | Finding | Where | Severity | Fix | Status |
|---|---|---|---|---|---|
| S1 | SSRF guard bypass: IPv4-mapped IPv6 literals (`http://[::ffff:127.0.0.1]/` reaches the guard as `::ffff:7f00:1`, which `isPrivateAddress` treats as public). Also via a redirect to such an address. Verified: allowed by the guard; fetch reached a 127.0.0.1-only server. | `api/src/pipeline/retrieval/url-guard.js:56` | High | Check with `net.BlockList`; map `::ffff:0:0/96` (hex or dotted) to IPv4 before checking; block `64:ff9b::/96`, `::/96`, `2002::/16`; ideally allow only `2000::/3`. Tests: `[::ffff:7f00:1]`, `[::ffff:a9fe:a9fe]`, redirect to one. | Fixed: `retrieval.test.js`: mapped/non-global IPv6 forms, reserved IPv4, mapped literal URLs, redirect to a mapped literal |
| S2 | Open redirect after sign-in: `?next=/%5Cevil.com` (or a tab) passes `safeNext` and Next's router hard-navigates to `https://evil.com/`. Traced through Next 16.4.6. | `web/src/components/auth-form.js:87` | Medium | Resolve with `new URL(v, location.origin)`, require the same origin, return `pathname + search + hash`; reject `\` and control characters. | Fixed: `safe-next.test.js`: backslash, tab, newline, `//`, absolute and `javascript:` values go to `/kits` |

## Code review

| # | Finding | Where | Severity | Fix | Status |
|---|---|---|---|---|---|
| C1 | Same as S1. | `url-guard.js:56` | Important | See S1. | Fixed: see S1 |
| C2 | Unhandled rejections can crash the API: `jobs.start/regenerate` are not awaited; `findById` sits outside the try, and `markFailed` / `failRegeneration` in the catch are unguarded. A Mongo failover mid-job exits the process. | `api/src/services/job.service.js:34` (and the regeneration path) | Important | Wrap all of `run` / `runRegeneration` (including final status writes) and add `.catch(log)` where the job promise is created. Test: a model whose write throws. | Fixed: `job.test.js`: a failing database before the job, while recording failure, and during regeneration is logged, not thrown |
| C3 | One malformed link (`/about%ZZ`) fails the whole kit: `decodeURIComponent` in `scoreLink` throws `URIError`. Verified. | `api/src/pipeline/retrieval/crawl.js:33` | Important | try/catch, fall back to the raw path. Test with `%ZZ`. | Fixed: `retrieval.test.js`: `/about%ZZ` is scored on its raw path |
| C4 | A malformed redirect `Location` throws out of `fetchResource` (which promises never to throw), failing the kit. | `api/src/pipeline/retrieval/fetch-page.js:69` | Important | Wrap the URL parse → `{ ok: false, reason: "bad redirect" }`; refuse non-http(s) redirect schemes. | Fixed: `retrieval.test.js`: malformed, `ftp:` and `javascript:` redirects are skipped pages |
| C5 | Untrusted-content wrapper bypass: nested tags rebuild the closing tag after one strip pass. Verified. | `api/src/lib/llm/untrusted.js:14` | Important | Escape every `<` in untrusted text (or strip until stable). Test with the nested input. | Fixed: `llm-client.test.js`: four nested look-alike attacks; ordinary `<` text untouched |
| C6 | Same as S2. | `auth-form.js:87` | Important | See S2. | Fixed: see S2 |
| C7 | Deleting a generating kit frees the one-generation lock and the daily cap while its job keeps running: unlimited parallel pipelines on the shared budget. | `api/src/services/kit.service.js:97`, `:66` | Important | Refuse to delete a `generating` kit (or cancel its job); count the daily cap from a per-user creation counter, not live documents. | Fixed: `kits.test.js`: deleting a generating kit is refused; the daily cap counts creations, so deleted kits do not free places |
| C8 | Quote check accepts one-word / substring quotes (`"java"` inside `"JavaScript"`), so a requirement the posting never states can pass. | `api/src/pipeline/extraction/extract-requirements.js:99` | Important | Word-boundary match, enforce the 2-word minimum, require most content words of `text` in the quote. Keep the highlighter (`shared/src/highlight.js`) agreeing. | Fixed: `extract.test.js` and `highlight.test.js`: whole-word quotes, wording grounded in the quote; checked against 33 real extracted requirements (0 dropped) |
| C9 | `filename*` in the résumé download keeps `'()*` unencoded, which strict parsers reject. | `api/src/controllers/profile.controller.js:11` | Nit | Also percent-encode `'()*`. | Fixed: `profile.test.js`: `O'Brien (CV)*.pdf` gives a valid `filename*` |

## How the fixes were made

- **S1** checks addresses by range with `net.BlockList` instead of matching strings; IPv6 is fetchable only in `2000::/3`, minus 6to4, Teredo and documentation ranges, so every IPv4-embedding form is refused.
- **S2** moves the check to `web/src/lib/safe-next.js`: resolve against our origin, require it unchanged, refuse `\` and control characters.
- **C2** gives every job promise a final `.catch` that logs; a kit left `generating` is marked interrupted on the next start, as before.
- **C5** removes tag look-alikes until nothing changes. Escaping `<` was rejected: it would change the posting text that quotes are checked against.
- **C7** refuses to delete a generating kit and records each creation on the user (latest 20), so the cap counts creations.
- **C8** requires whole-word quotes and that two thirds of the requirement's content words (grammar and filler like "experience" aside) appear in its quote, with five-letter stems so "mentor" matches "mentoring". The reviewer's "two-word minimum" was not adopted: real postings list one-word tools ("Docker", "Typescript").
- **C3, C4, C9** are local guards: a safe decode, a safe redirect parse (http(s) only), RFC 5987 encoding.
