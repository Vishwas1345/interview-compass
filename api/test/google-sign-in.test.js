// Google sign-in through the API (D22, spec docs/specs/google-sign-in/SPEC.md):
// the round trip, the account rules, and every failure. Google's token endpoint is
// faked; everything else is real (Express, MongoDB, sessions).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, startTestApp, browser, testClock } from "./helpers/app.js";
import { TEST_GOOGLE, fakeGoogle, claims } from "./helpers/google.js";
import { createGoogleClient } from "../src/lib/google.js";
import { challengeFor } from "../src/utils/pkce.js";
import { createAuthService } from "../src/services/auth.service.js";
import { createSessionService } from "../src/services/session.service.js";
import { createModels } from "../src/models/index.js";

const MIN = 60 * 1000;
const PASSWORD = "long enough pw";
let testDb, app, plain, clock;
// Who Google says is signing in, per test. The fake answers the exchange with these
// claims and the nonce from the request's own round trip (via `pendingNonce`).
let person, answer, pendingNonce;
const logged = [];
// Google's photo server: a small PNG unless a test says otherwise.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2048, 3)]);
let picture = () => new Response(PNG, { headers: { "content-type": "image/png" } });
const PHOTO = "https://lh3.googleusercontent.com/a/photo=s96-c";
const google = fakeGoogle(() => (answer ? answer() : claims(clock.now(), { ...person, nonce: pendingNonce })), { pictures: (url, init) => picture(url, init) });

before(async () => {
  testDb = await startTestDb();
  clock = testClock();
  const client = createGoogleClient({ ...TEST_GOOGLE, redirectUri: "http://localhost/api/auth/google/callback", fetch: google.fetch, now: clock.now });
  app = await startTestApp({ db: testDb.db, now: clock.now, google: client, log: (line) => logged.push(line) });
  plain = await startTestApp({ db: testDb.db, now: clock.now }); // Google not configured
});
after(async () => {
  app.close();
  plain.close();
  await testDb.stop();
});

// Step 1 in a browser: → { b, state, nonce, url }
async function start(b = browser(app.origin), next) {
  const res = await b.get(`/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  assert.equal(res.status, 302);
  const url = new URL(res.location);
  return { b, res, url, state: url.searchParams.get("state"), nonce: url.searchParams.get("nonce") };
}
// The whole round trip as `who`: → the callback response
async function signIn(who, { b, next } = {}) {
  const trip = await start(b, next);
  person = who;
  pendingNonce = trip.nonce;
  const res = await trip.b.get(`/api/auth/google/callback?code=code-${Math.random()}&state=${trip.state}`);
  return { ...trip, res };
}
const users = () => testDb.db.collection("users");

test("options say whether Google sign-in is offered; without setup its routes do not exist", async () => {
  assert.deepEqual((await browser(app.origin).get("/api/auth/options")).body, { google: true });
  assert.deepEqual((await browser(plain.origin).get("/api/auth/options")).body, { google: false });
  assert.equal((await browser(plain.origin).get("/api/auth/google/start")).status, 404);
  assert.equal((await browser(plain.origin).get("/api/auth/google/callback?code=x&state=y")).status, 404);
});

test("start sends the browser to Google with a fresh state, nonce and PKCE challenge kept in a short httpOnly cookie", async () => {
  const { res, url, b } = await start();
  assert.equal(url.origin, "https://accounts.google.com");
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("ic_google="));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\/api\/auth\/google/i);
  assert.match(cookie, /Max-Age=600/i);
  const trip = JSON.parse(Buffer.from(b.jar.get("ic_google"), "base64url").toString());
  assert.equal(trip.state, url.searchParams.get("state"));
  assert.equal(trip.nonce, url.searchParams.get("nonce"));
  assert.equal(challengeFor(trip.verifier), url.searchParams.get("code_challenge"), "Google sees only the challenge");
  const again = await start();
  assert.notEqual(again.state, trip.state, "every round trip has its own state");
});

test("a new person gets an account named from Google, is signed in, and lands on their kits", async () => {
  const { res, b } = await signIn({ sub: "new-1", email: "new.person@example.com", name: "New Person" });
  assert.equal(res.status, 303);
  assert.equal(res.location, "/kits");
  assert.equal(b.jar.has("ic_google"), false, "the round-trip cookie is gone");
  const me = await b.get("/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, "new.person@example.com");
  assert.equal(me.body.user.name, "New Person");
  const stored = await users().findOne({ email: "new.person@example.com" });
  assert.equal(stored.googleId, "new-1");
  assert.equal(stored.passwordHash, undefined);
  // The exchange carried this round trip's verifier.
  const exchange = google.requests.at(-1).form;
  assert.equal(challengeFor(exchange.code_verifier).length, 43);
});

test("a returning person opens the same account; a changed Google email follows unless it is taken", async () => {
  const first = await signIn({ sub: "ret-1", email: "ret@example.com", name: "R" });
  const id = (await first.b.get("/api/auth/me")).body.user.id;
  const again = await signIn({ sub: "ret-1", email: "ret.new@example.com", name: "R" });
  const me = (await again.b.get("/api/auth/me")).body.user;
  assert.equal(me.id, id);
  assert.equal(me.email, "ret.new@example.com");
  await browser(app.origin).post("/api/auth/register", { email: "taken@example.com", password: PASSWORD });
  const third = await signIn({ sub: "ret-1", email: "taken@example.com", name: "R" });
  const kept = (await third.b.get("/api/auth/me")).body.user;
  assert.equal(kept.id, id, "still the Google account, not the password one");
  assert.equal(kept.email, "ret.new@example.com", "the email another account owns is not taken over");
});

test("a password account with the same email becomes a Google account: password gone, other sessions ended, notice shown", async () => {
  const squatter = browser(app.origin);
  assert.equal((await squatter.post("/api/auth/register", { email: "owner@example.com", password: PASSWORD })).status, 201);
  assert.equal((await squatter.get("/api/auth/me")).status, 200);

  const { res, b } = await signIn({ sub: "owner-1", email: "owner@example.com", name: "Owner" });
  assert.equal(res.location, "/profile?notice=google-linked");
  assert.equal((await b.get("/api/auth/me")).status, 200, "the Google person is signed in");
  assert.equal((await squatter.get("/api/auth/me")).status, 401, "the earlier session ended");
  const login = await browser(app.origin).post("/api/auth/login", { email: "owner@example.com", password: PASSWORD });
  assert.equal(login.status, 401);
  assert.equal(login.body.error.message, "Email or password is incorrect.", "the usual message, nothing revealed");
  const stored = await users().findOne({ email: "owner@example.com" });
  assert.equal(stored.googleId, "owner-1");
  assert.equal(stored.passwordHash, undefined);
});

test("Google sign-in returns to the page that asked for it, never to another site", async () => {
  assert.equal((await signIn({ sub: "n1", email: "n1@example.com" }, { next: "/kits/abc?tab=practice" })).res.location, "/kits/abc?tab=practice");
  assert.equal((await signIn({ sub: "n2", email: "n2@example.com" }, { next: "//evil.example/x" })).res.location, "/kits");
  assert.equal((await signIn({ sub: "n3", email: "n3@example.com" }, { next: "/\\evil.example" })).res.location, "/kits");
});

test("an unverified Google email is refused and creates nothing", async () => {
  const { res, b } = await signIn({ sub: "unv-1", email: "unverified@example.com", email_verified: false }, { next: "/kits/x" });
  assert.equal(res.location, "/login?error=google_unverified&next=%2Fkits%2Fx");
  assert.equal(b.jar.has("ic_session"), false);
  assert.equal(await users().countDocuments({ email: "unverified@example.com" }), 0);
});

test("cancelling at Google returns to sign-in with the cancelled message", async () => {
  const { b } = await start();
  const res = await b.get("/api/auth/google/callback?error=access_denied&state=whatever");
  assert.equal(res.location, "/login?error=google_cancelled");
  assert.equal(b.jar.has("ic_google"), false);
});

test("a forged, stale, foreign or replayed return signs no one in", async () => {
  const calls = google.requests.length;
  // No round-trip cookie at all (started in another browser).
  const stranger = await browser(app.origin).get("/api/auth/google/callback?code=c&state=s");
  assert.equal(stranger.location, "/login?error=google_expired");
  // Wrong state (a forged return link).
  const forged = await start();
  assert.equal((await forged.b.get(`/api/auth/google/callback?code=c&state=${forged.state}x`)).location, "/login?error=google_expired");
  // Missing code.
  const noCode = await start();
  assert.equal((await noCode.b.get(`/api/auth/google/callback?state=${noCode.state}`)).location, "/login?error=google_expired");
  // Older than 10 minutes.
  const slow = await start();
  clock.advance(10 * MIN + 1);
  assert.equal((await slow.b.get(`/api/auth/google/callback?code=c&state=${slow.state}`)).location, "/login?error=google_expired");
  // A tampered cookie.
  const tampered = await start();
  tampered.b.jar.set("ic_google", "not-base64-json");
  assert.equal((await tampered.b.get(`/api/auth/google/callback?code=c&state=${tampered.state}`)).location, "/login?error=google_expired");
  assert.equal(google.requests.length, calls, "Google was never asked to exchange a code");
  // Replay: the same return link a second time, after a successful sign-in.
  const ok = await start();
  person = { sub: "replay-1", email: "replay@example.com" };
  pendingNonce = ok.nonce;
  const link = `/api/auth/google/callback?code=c1&state=${ok.state}`;
  assert.equal((await ok.b.get(link)).location, "/kits");
  const replay = browser(app.origin);
  assert.equal((await replay.get(link)).location, "/login?error=google_expired");
  assert.equal(replay.jar.has("ic_session"), false);
});

test("Google being down or answering strangely ends on sign-in with the unavailable message, and is logged", async () => {
  answer = () => new Response("{}", { status: 500 });
  try {
    const { res, b } = await signIn({ sub: "down-1", email: "down@example.com" });
    assert.equal(res.location, "/login?error=google_unavailable");
    assert.equal(b.jar.has("ic_session"), false);
    const line = logged.find((l) => l.startsWith("google sign-in unavailable"));
    assert.match(line, /id=[\w-]+: token endpoint returned 500/);
    assert.ok(!/code=|code-/.test(line), "the one-time code is never logged");
  } finally {
    answer = null;
  }
  // A token minted for another sign-in (wrong nonce) is just as unusable.
  const trip = await start();
  person = { sub: "nonce-1", email: "nonce@example.com" };
  pendingNonce = "someone-elses-nonce";
  assert.equal((await trip.b.get(`/api/auth/google/callback?code=c&state=${trip.state}`)).location, "/login?error=google_unavailable");
});

test("two sign-ins racing for the same new person end in one account", async () => {
  const models = createModels(testDb.db);
  const auth = createAuthService({ users: models.users, sessions: createSessionService({ sessions: models.sessions, now: clock.now }), now: clock.now });
  const who = { sub: "race-1", email: "race@example.com", name: "" };
  const results = await Promise.all([auth.googleSignIn(who), auth.googleSignIn(who), auth.googleSignIn(who)]);
  assert.equal(new Set(results.map((r) => String(r.user._id))).size, 1, "every racer got the same account");
  assert.equal(await users().countDocuments({ email: "race@example.com" }), 1);
});

test("password sign-in for a Google-only account takes the dummy-check path and says the usual thing", async () => {
  await signIn({ sub: "only-1", email: "only.google@example.com" });
  const res = await browser(app.origin).post("/api/auth/login", { email: "only.google@example.com", password: "anything at all" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
  assert.equal(res.body.error.message, "Email or password is incorrect.");
  // Timing: a Google-only email must cost a full password check, like a password
  // account with a wrong password, or response times would reveal which emails
  // have Google accounts. scrypt
  // takes tens of milliseconds; skipping it takes about one.
  const timed = async (email) => {
    const started = performance.now();
    await browser(app.origin).post("/api/auth/login", { email, password: "anything at all" });
    return performance.now() - started;
  };
  const median = async (email) => {
    const times = [];
    for (let i = 0; i < 3; i += 1) times.push(await timed(email)); // one at a time: concurrency would blur it
    return times.sort((a, b) => a - b)[1];
  };
  const googleOnly = await median("only.google@example.com");
  await browser(app.origin).post("/api/auth/register", { email: "has.password@example.com", password: PASSWORD });
  const wrongPassword = await median("has.password@example.com");
  assert.ok(googleOnly > wrongPassword * 0.4, `Google-only ${googleOnly.toFixed(1)} ms vs wrong password ${wrongPassword.toFixed(1)} ms`);
});

// --- accounts without a password (phase 3) ------------------------------------

test("/me says how the account signs in", async () => {
  const google = await signIn({ sub: "method-1", email: "method.google@example.com" });
  assert.equal((await google.b.get("/api/auth/me")).body.user.signInMethod, "google");
  const pw = browser(app.origin);
  await pw.post("/api/auth/register", { email: "method.password@example.com", password: PASSWORD });
  assert.equal((await pw.get("/api/auth/me")).body.user.signInMethod, "password");
});

test("a Google account cannot change its email or password here: both belong to Google", async () => {
  const { b } = await signIn({ sub: "managed-1", email: "managed@example.com" });
  const email = await b.post("/api/account/email", { email: "other@example.com", currentPassword: "anything" });
  assert.equal(email.status, 409);
  assert.equal(email.body.error.code, "GOOGLE_ACCOUNT");
  assert.match(email.body.error.message, /email is managed by Google/);
  const password = await b.post("/api/account/password", { currentPassword: "anything", newPassword: "a brand new password" });
  assert.equal(password.status, 409);
  assert.match(password.body.error.message, /password is managed by Google/);
  const stored = await users().findOne({ googleId: "managed-1" });
  assert.equal(stored.email, "managed@example.com");
  assert.equal(stored.passwordHash, undefined, "no password was set behind Google's back");
});

test("a Google account is deleted by typing its email; anything else is refused", async () => {
  const { b } = await signIn({ sub: "delete-1", email: "delete.me@example.com" });
  for (const body of [{}, { confirmEmail: "someone@example.com" }, { password: "a guess" }]) {
    const res = await b.post("/api/account/delete", body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.code, "CONFIRM_EMAIL");
  }
  assert.equal(await users().countDocuments({ googleId: "delete-1" }), 1, "still there");
  assert.equal((await b.post("/api/account/delete", { confirmEmail: "  Delete.Me@example.com " })).status, 204);
  assert.equal(await users().countDocuments({ googleId: "delete-1" }), 0);
  assert.equal((await b.get("/api/auth/me")).status, 401);
});

test("a password account still needs its password to delete; a typed email is not enough", async () => {
  const b = browser(app.origin);
  await b.post("/api/auth/register", { email: "keeps.password@example.com", password: PASSWORD });
  const typed = await b.post("/api/account/delete", { confirmEmail: "keeps.password@example.com" });
  assert.equal(typed.status, 400);
  assert.equal(typed.body.error.message, "Enter your current password.");
  assert.equal((await b.post("/api/account/delete", { password: "wrong" })).status, 401);
  assert.equal((await b.post("/api/account/delete", { password: PASSWORD })).status, 204);
});

// --- filling the profile from Google ------------------------------------------

const photoOf = async (b) => {
  const res = await b.raw("GET", "/api/profile/photo");
  return res.status === 200 ? res.status : null;
};

test("a new Google account gets its name and its Google photo, copied into the app", async () => {
  const { b } = await signIn({ sub: "pic-1", email: "pic.one@example.com", name: "Pic One", picture: PHOTO });
  const profile = (await b.get("/api/profile")).body.profile;
  assert.equal(profile.name, "Pic One");
  assert.equal(profile.photo.contentType, "image/png");
  assert.equal(profile.photo.size, PNG.length);
  assert.notEqual(profile.user.photoVersion, null, "the sidebar shows it");
  const download = google.pictureRequests.at(-1);
  assert.equal(download.url, "https://lh3.googleusercontent.com/a/photo=s256-c");
  assert.equal(download.init.redirect, "error");
  assert.equal(await photoOf(b), 200, "served from our own site");
});

test("taking over a password account fills only what is empty, never what the person set", async () => {
  // Empty profile: gets Google's name and photo.
  const empty = browser(app.origin);
  await empty.post("/api/auth/register", { email: "empty.profile@example.com", password: PASSWORD });
  const first = await signIn({ sub: "fill-1", email: "empty.profile@example.com", name: "From Google", picture: PHOTO });
  const filled = (await first.b.get("/api/profile")).body.profile;
  assert.equal(filled.name, "From Google");
  assert.equal(filled.photo.contentType, "image/png");

  // Own name and photo: both kept.
  const own = browser(app.origin);
  await own.post("/api/auth/register", { email: "own.profile@example.com", password: PASSWORD });
  await own.raw("PATCH", "/api/profile", { name: "My Own Name" });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 9)]);
  await fetch(`${app.origin}/api/profile/photo`, { method: "PUT", headers: { "Content-Type": "image/jpeg", "X-Requested-With": "InterviewCompass", Cookie: [...own.jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: jpeg });
  const before = (await own.get("/api/profile")).body.profile;
  assert.equal(before.photo.contentType, "image/jpeg");
  const second = await signIn({ sub: "fill-2", email: "own.profile@example.com", name: "From Google", picture: PHOTO });
  const kept = (await second.b.get("/api/profile")).body.profile;
  assert.equal(kept.name, "My Own Name");
  assert.equal(kept.photo.contentType, "image/jpeg");
});

test("a photo the person removed is not brought back at the next Google sign-in", async () => {
  const { b } = await signIn({ sub: "removed-1", email: "removed@example.com", name: "R", picture: PHOTO });
  assert.equal((await b.del("/api/profile/photo")).status, 200);
  const again = await signIn({ sub: "removed-1", email: "removed@example.com", name: "R", picture: PHOTO });
  assert.equal((await again.b.get("/api/profile")).body.profile.photo, null);
});

test("a bad or failed photo never stops the sign-in", async () => {
  const cases = {
    "not an image": () => new Response("<html>hello</html>", { headers: { "content-type": "image/png" } }),
    "too big": () => new Response(Buffer.concat([PNG, Buffer.alloc(1024 * 1024)])),
    "server error": () => new Response("no", { status: 500 }),
    "refused redirect": () => Promise.reject(new TypeError("fetch failed: redirect mode is set to error")),
  };
  let n = 0;
  for (const [name, answerWith] of Object.entries(cases)) {
    picture = answerWith;
    const { res, b } = await signIn({ sub: `badpic-${++n}`, email: `badpic${n}@example.com`, name: "B", picture: PHOTO });
    assert.equal(res.location, "/kits", name);
    assert.equal((await b.get("/api/profile")).body.profile.photo, null, name);
  }
  picture = () => new Response(PNG);
  // A link off Google's image host is never even requested.
  const calls = google.pictureRequests.length;
  const { b } = await signIn({ sub: "badpic-host", email: "badpic.host@example.com", name: "B", picture: "https://169.254.169.254/latest/meta-data" });
  assert.equal(google.pictureRequests.length, calls);
  assert.equal((await b.get("/api/profile")).body.profile.photo, null);
});
