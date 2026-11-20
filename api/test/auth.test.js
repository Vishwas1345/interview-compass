import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, startTestApp, browser, testClock } from "./helpers/app.js";
import { SESSION_DAYS } from "../src/auth/sessions.js";

const DAY = 24 * 60 * 60 * 1000;
let testDb, app, clock;
before(async () => {
  testDb = await startTestDb();
  clock = testClock();
  app = await startTestApp({ db: testDb.db, now: clock.now });
});
after(async () => {
  app.close();
  await testDb.stop();
});

let counter = 0;
const newEmail = () => `user${++counter}@example.com`;
const PASSWORD = "correct horse battery";

test("register signs the user in: the cookie is httpOnly and SameSite=Lax, and /me works", async () => {
  const b = browser(app.origin);
  const email = newEmail();
  const res = await b.post("/api/auth/register", { email: `  ${email.toUpperCase()} `, password: PASSWORD });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, email, "stored trimmed and lower-case");
  const cookie = res.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal((await b.get("/api/auth/me")).body.user.email, email);
});

test("a second account with the same email is refused", async () => {
  const email = newEmail();
  await browser(app.origin).post("/api/auth/register", { email, password: PASSWORD });
  const res = await browser(app.origin).post("/api/auth/register", { email: email.toUpperCase(), password: PASSWORD });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "EMAIL_TAKEN");
});

test("short passwords and bad emails get field messages", async () => {
  const short = await browser(app.origin).post("/api/auth/register", { email: newEmail(), password: "1234567" });
  assert.equal(short.status, 400);
  assert.match(short.body.error.message, /at least 8/);
  const bad = await browser(app.origin).post("/api/auth/register", { email: "not-an-email", password: PASSWORD });
  assert.match(bad.body.error.message, /valid email/);
});

test("wrong password and unknown email get the same answer", async () => {
  const email = newEmail();
  await browser(app.origin).post("/api/auth/register", { email, password: PASSWORD });
  const wrong = await browser(app.origin).post("/api/auth/login", { email, password: "wrong password" });
  const unknown = await browser(app.origin).post("/api/auth/login", { email: newEmail(), password: PASSWORD });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
  assert.match(wrong.body.error.message, /^Email or password is incorrect/);
});

test("login works with any casing of the email; logout ends the session", async () => {
  const email = newEmail();
  await browser(app.origin).post("/api/auth/register", { email, password: PASSWORD });
  const b = browser(app.origin);
  assert.equal((await b.post("/api/auth/login", { email: email.toUpperCase(), password: PASSWORD })).status, 200);
  const token = b.jar.get("ic_session");
  assert.equal((await b.post("/api/auth/logout")).status, 204);
  assert.equal(b.jar.size, 0, "cookie cleared");
  // Even a copy of the old cookie no longer works.
  const replay = await browser(app.origin).raw("GET", "/api/auth/me", undefined, { headers: { Cookie: `ic_session=${token}` } });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error.code, "SESSION_EXPIRED");
});

test("no cookie → UNAUTHENTICATED; an expired session → SESSION_EXPIRED", async () => {
  assert.equal((await browser(app.origin).get("/api/auth/me")).body.error.code, "UNAUTHENTICATED");
  const b = browser(app.origin);
  await b.post("/api/auth/register", { email: newEmail(), password: PASSWORD });
  clock.advance(SESSION_DAYS * DAY + 1000);
  const res = await b.get("/api/auth/me");
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "SESSION_EXPIRED");
});

test("sessions slide: using the app keeps it alive past the first 7 days", async () => {
  const b = browser(app.origin);
  await b.post("/api/auth/register", { email: newEmail(), password: PASSWORD });
  for (let day = 0; day < 10; day += 2) {
    clock.advance(2 * DAY);
    assert.equal((await b.get("/api/auth/me")).status, 200, `day ${day + 2}`);
  }
});

test("the database stores neither the session token nor the password", async () => {
  const b = browser(app.origin);
  const email = newEmail();
  await b.post("/api/auth/register", { email, password: PASSWORD });
  const token = b.jar.get("ic_session");
  const user = await testDb.db.collection("users").findOne({ email });
  assert.ok(!JSON.stringify(user).includes(PASSWORD));
  assert.match(user.passwordHash, /^scrypt\$/);
  assert.equal(await testDb.db.collection("sessions").findOne({ _id: token }), null);
  assert.equal(await testDb.db.collection("sessions").countDocuments({ userId: user._id }), 1);
});

test("mutations must be JSON (blocks cross-site form posts)", async () => {
  const res = await browser(app.origin).raw("POST", "/api/auth/login", "email=a%40b.c&password=x", {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  assert.equal(res.status, 415);
  assert.equal(res.body.error.code, "JSON_REQUIRED");
});

test("a body-less logout works, with or without a JSON content type (found live with curl)", async () => {
  for (const headers of [{}, { "Content-Type": "application/json" }]) {
    const b = browser(app.origin);
    await b.post("/api/auth/register", { email: newEmail(), password: PASSWORD });
    const res = await b.raw("POST", "/api/auth/logout", undefined, { headers });
    assert.equal(res.status, 204, JSON.stringify(headers));
    assert.equal((await b.get("/api/auth/me")).status, 401);
  }
});

test("malformed JSON and unknown endpoints get structured errors", async () => {
  const bad = await browser(app.origin).raw("POST", "/api/auth/login", "{not json", { headers: { "Content-Type": "application/json" } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION");
  const missing = await browser(app.origin).get("/api/nope");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "NOT_FOUND");
});
