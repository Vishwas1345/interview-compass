// Production hardening (2026-11-21): sign-in throttling, request ids, security
// headers, and the scrypt cost with upgrade-on-login.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { scrypt, randomBytes } from "node:crypto";
import { startTestDb, startTestApp, browser, testClock } from "./helpers/app.js";
import { hashPassword, verifyPassword, needsRehash, SCRYPT } from "../src/services/password.service.js";

const MIN = 60 * 1000;
let testDb, app, clock;
before(async () => {
  testDb = await startTestDb();
  clock = testClock();
  app = await startTestApp({ db: testDb.db, now: clock.now, production: true });
});
after(async () => {
  app.close();
  await testDb.stop();
});

let counter = 0;
const PASSWORD = "long enough pw";
async function account() {
  const email = `sec${++counter}@example.com`;
  await browser(app.origin).post("/api/auth/register", { email, password: PASSWORD }, { headers: { "X-Forwarded-For": `10.9.${counter}.1` } });
  return email;
}
// Each call can come "from" a different IP (the app trusts one proxy hop).
const loginFrom = (ip, email, password) => browser(app.origin).post("/api/auth/login", { email, password }, { headers: { "X-Forwarded-For": ip } });

// --- sign-in throttling -------------------------------------------------------

test("10 failed sign-ins for one email lock that email for 15 minutes, from any IP", async () => {
  const email = await account();
  for (let i = 0; i < 10; i += 1) assert.equal((await loginFrom(`10.1.0.${i}`, email, "wrong password")).status, 401);
  const blocked = await loginFrom("10.1.1.1", email, PASSWORD); // even the right password, from a new IP
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, "TOO_MANY_ATTEMPTS");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  clock.advance(15 * MIN + 1);
  assert.equal((await loginFrom("10.1.1.1", email, PASSWORD)).status, 200, "allowed again after the window");
});

test("a successful sign-in clears the failure count for that email", async () => {
  const email = await account();
  for (let i = 0; i < 9; i += 1) await loginFrom("10.2.0.1", email, "wrong password");
  assert.equal((await loginFrom("10.2.0.1", email, PASSWORD)).status, 200);
  for (let i = 0; i < 9; i += 1) assert.equal((await loginFrom("10.2.0.1", email, "wrong password")).status, 401);
});

test("one IP spraying many accounts is throttled after 50 failures", async () => {
  for (let i = 0; i < 50; i += 1) await loginFrom("10.3.0.1", `nobody${i}@example.com`, "guess");
  const blocked = await loginFrom("10.3.0.1", "someone-else@example.com", "guess");
  assert.equal(blocked.status, 429);
  assert.equal((await loginFrom("10.3.0.2", "someone-else@example.com", "guess")).status, 401, "other IPs unaffected");
});

test("sign-ups are limited to 10 per IP per hour", async () => {
  for (let i = 0; i < 10; i += 1) {
    const res = await browser(app.origin).post("/api/auth/register", { email: `bulk${i}@example.com`, password: PASSWORD }, { headers: { "X-Forwarded-For": "10.4.0.1" } });
    assert.equal(res.status, 201, `sign-up ${i + 1}`);
  }
  const blocked = await browser(app.origin).post("/api/auth/register", { email: "bulk-extra@example.com", password: PASSWORD }, { headers: { "X-Forwarded-For": "10.4.0.1" } });
  assert.equal(blocked.status, 429);
});

// --- request ids --------------------------------------------------------------

test("every response carries a request id, and errors include it in the body", async () => {
  const ok = await browser(app.origin).get("/api/health");
  assert.match(ok.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  const failed = await browser(app.origin).get("/api/kits");
  assert.equal(failed.body.error.requestId, failed.headers.get("x-request-id"));
});

test("a safe incoming request id is kept; an unsafe one is replaced", async () => {
  const kept = await browser(app.origin).raw("GET", "/api/health", undefined, { headers: { "X-Request-Id": "trace-abc-123" } });
  assert.equal(kept.headers.get("x-request-id"), "trace-abc-123");
  const replaced = await browser(app.origin).raw("GET", "/api/health", undefined, { headers: { "X-Request-Id": "bad id with spaces" } });
  assert.notEqual(replaced.headers.get("x-request-id"), "bad id with spaces");
});

// --- security headers -------------------------------------------------------

test("API responses carry security headers; HSTS in production", async () => {
  const res = await browser(app.origin).get("/api/health");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("content-security-policy"), /default-src 'none'; frame-ancestors 'none'/);
  assert.match(res.headers.get("strict-transport-security"), /max-age=\d+/);
  assert.equal(res.headers.get("x-powered-by"), null);
});

// --- scrypt cost ----------------------------------------------------------------

test("new passwords use scrypt N=32768 and record their parameters", async () => {
  const stored = await hashPassword("pw for test");
  assert.match(stored, /^scrypt\$N=32768,r=8,p=1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword("pw for test", stored), true);
  assert.equal(await verifyPassword("wrong", stored), false);
  assert.equal(needsRehash(stored), false);
  assert.deepEqual(SCRYPT, { N: 32768, r: 8, p: 1 });
});

test("an old-format hash still verifies and is upgraded at the next sign-in", async () => {
  const salt = randomBytes(16);
  const key = await new Promise((resolve, reject) => scrypt(PASSWORD, salt, 64, (e, k) => (e ? reject(e) : resolve(k))));
  const legacy = ["scrypt", salt.toString("hex"), key.toString("hex")].join("$"); // N=16384, the old default
  assert.equal(await verifyPassword(PASSWORD, legacy), true);
  assert.equal(needsRehash(legacy), true);

  const email = "legacy@example.com";
  await testDb.db.collection("users").insertOne({ email, passwordHash: legacy, createdAt: new Date() });
  assert.equal((await loginFrom("10.5.0.1", email, PASSWORD)).status, 200);
  const upgraded = (await testDb.db.collection("users").findOne({ email })).passwordHash;
  assert.match(upgraded, /^scrypt\$N=32768/);
  assert.equal((await loginFrom("10.5.0.1", email, PASSWORD)).status, 200, "the upgraded hash works");
});
