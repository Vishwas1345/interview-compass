// The Google client on its own (D22): the URL people are sent to, the code exchange,
// and every claim check that stops a forged, replayed or foreign token.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGoogleClient, checkClaims, GoogleSignInError, SCOPES, pictureUrl } from "../src/lib/google.js";
import { challengeFor } from "../src/utils/pkce.js";
import { loadConfig, productionProblems, googleEnabled } from "../src/config/index.js";
import { TEST_GOOGLE, fakeGoogle, claims } from "./helpers/google.js";

const NOW = new Date("2026-11-21T10:00:00Z");
const REDIRECT = "https://app.example/api/auth/google/callback";
const client = (fetch) => createGoogleClient({ ...TEST_GOOGLE, redirectUri: REDIRECT, fetch, now: () => NOW });
const check = (overrides, nonce = "nonce-1") => checkClaims(claims(NOW, { nonce: "nonce-1", ...overrides }), { clientId: TEST_GOOGLE.clientId, nonce, now: NOW });

function rejects(fn, reason, pattern) {
  assert.throws(fn, (error) => error instanceof GoogleSignInError && error.reason === reason && (!pattern || pattern.test(error.message)));
}

test("the Google URL carries state, nonce and an S256 challenge, and asks only for identity", () => {
  const url = new URL(client().authUrl({ state: "s1", nonce: "n1", challenge: challengeFor("verifier") }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  const p = Object.fromEntries(url.searchParams);
  assert.equal(p.client_id, TEST_GOOGLE.clientId);
  assert.equal(p.redirect_uri, REDIRECT);
  assert.equal(p.response_type, "code");
  assert.equal(p.state, "s1");
  assert.equal(p.nonce, "n1");
  assert.equal(p.code_challenge, challengeFor("verifier"));
  assert.equal(p.code_challenge_method, "S256");
  assert.equal(p.scope, "openid email profile");
  assert.equal(SCOPES.split(" ").length, 3, "no wider scope than name and email");
  assert.ok(!url.search.includes(TEST_GOOGLE.clientSecret), "the secret never goes to the browser");
});

test("the challenge is the base64url SHA-256 of the verifier (RFC 7636 example)", () => {
  assert.equal(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("the exchange posts code, verifier, redirect and secret in the body, and returns the identity", async () => {
  const google = fakeGoogle(() => claims(NOW, { nonce: "n1", email: " Person@Example.com " }));
  const identity = await client(google.fetch).exchange("code-1", "verifier-1", "n1");
  assert.deepEqual(identity, { sub: "google-sub-1", email: "person@example.com", name: "Asha Rao", picture: "" });
  const [{ url, form, init }] = google.requests;
  assert.equal(url, "https://oauth2.googleapis.com/token");
  assert.equal(init.method, "POST");
  assert.deepEqual(form, { code: "code-1", client_id: TEST_GOOGLE.clientId, client_secret: TEST_GOOGLE.clientSecret, redirect_uri: REDIRECT, grant_type: "authorization_code", code_verifier: "verifier-1" });
  assert.ok(!url.includes("secret") && !url.includes("code-1"), "nothing sensitive in the URL");
});

test("a failing, slow or garbled token endpoint is 'unavailable'", async () => {
  const cases = {
    "status 400": () => new Response("{}", { status: 400 }),
    "not JSON": () => new Response("<html>", { status: 200 }),
    "no ID token": () => Response.json({ access_token: "x" }),
  };
  for (const [name, answer] of Object.entries(cases)) {
    await assert.rejects(client(fakeGoogle(answer).fetch).exchange("c", "v", "n1"), (e) => e.reason === "unavailable", name);
  }
  // A request that never answers. AbortSignal.timeout's timer does not keep Node
  // alive by itself (in production the server does), so the fake holds a normal
  // timer while it waits, or Node may exit before the timeout fires (CI did).
  const hanging = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => {}, 10_000);
      signal.addEventListener("abort", () => (clearTimeout(keepAlive), reject(signal.reason)));
    });
  const slow = createGoogleClient({ ...TEST_GOOGLE, redirectUri: REDIRECT, fetch: hanging, timeoutMs: 20 });
  await assert.rejects(slow.exchange("c", "v", "n1"), (e) => e.reason === "unavailable" && /unreachable/.test(e.message));
});

test("a token that is not ours, not current or not for this sign-in is refused", () => {
  rejects(() => check({ iss: "https://evil.example" }), "unavailable", /issuer/);
  rejects(() => check({ aud: "someone-else.apps.googleusercontent.com" }), "unavailable", /another app/);
  rejects(() => check({ aud: [TEST_GOOGLE.clientId, "other"], azp: "other" }), "unavailable", /another app/);
  rejects(() => check({ exp: Math.floor(NOW.getTime() / 1000) }), "unavailable", /expired/);
  rejects(() => check({}, "a-different-nonce"), "unavailable", /nonce/);
  rejects(() => check({ nonce: undefined }, ""), "unavailable", /nonce/);
  rejects(() => check({ sub: "" }), "unavailable", /subject/);
  rejects(() => check({ email: undefined }), "unavailable", /email/);
});

test("an unverified email is its own reason, so the person is told why", () => {
  rejects(() => check({ email_verified: false }), "unverified");
  rejects(() => check({ email_verified: undefined }), "unverified");
});

test("both documented issuer forms are accepted, and a long name is cut to the profile limit", () => {
  assert.equal(check({ iss: "accounts.google.com" }).sub, "google-sub-1");
  assert.equal(check({ email_verified: "true", name: "x".repeat(200) }).name.length, 80);
  assert.equal(check({ name: undefined }).name, "");
});

test("Google sign-in is on only when all three settings exist, and production refuses half a setup", () => {
  const full = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", APP_ORIGIN: "https://app.example/" };
  assert.equal(googleEnabled(loadConfig(full)), true);
  assert.equal(loadConfig(full).appOrigin, "https://app.example", "trailing slash dropped");
  assert.equal(googleEnabled(loadConfig({ GOOGLE_CLIENT_ID: "id" })), false);
  const base = { NODE_ENV: "production", MONGODB_URI: "mongodb://x", LLM_API_KEY: "k" };
  assert.deepEqual(productionProblems(loadConfig({ ...base, ...full })), []);
  assert.deepEqual(productionProblems(loadConfig(base)), [], "no Google at all is fine");
  assert.match(productionProblems(loadConfig({ ...base, GOOGLE_CLIENT_ID: "id" })).join(), /set together/);
  assert.match(productionProblems(loadConfig({ ...base, ...full, APP_ORIGIN: "http://app.example" })).join(), /https/);
});

// --- the Google profile photo -------------------------------------------------

test("the photo link is passed on, and only https links on Google's image host are ever fetched", () => {
  assert.equal(check({ picture: "https://lh3.googleusercontent.com/a/abc=s96-c" }).picture, "https://lh3.googleusercontent.com/a/abc=s96-c");
  assert.equal(check({ picture: 42 }).picture, "");
  assert.equal(pictureUrl("https://lh3.googleusercontent.com/a/abc=s96-c"), "https://lh3.googleusercontent.com/a/abc=s256-c", "asks for a 256 px square");
  assert.equal(pictureUrl("https://lh3.googleusercontent.com/a/abc"), "https://lh3.googleusercontent.com/a/abc");
  for (const bad of [
    "http://lh3.googleusercontent.com/a/abc", // not https
    "https://169.254.169.254/latest/meta-data", // internal address
    "https://googleusercontent.com.evil.example/a", // look-alike host
    "https://evilgoogleusercontent.com/a", // suffix without the dot
    "https://user:pw@lh3.googleusercontent.com/a", // credentials
    "https://lh3.googleusercontent.com:8443/a", // odd port
    "not a url",
    "",
  ]) {
    assert.equal(pictureUrl(bad), null, bad);
  }
});

test("downloading the photo: no redirects, a size cap, a time limit, and any failure is just 'no photo'", async () => {
  const URL_OK = "https://lh3.googleusercontent.com/a/abc=s96-c";
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
  const withPicture = (pictures, timeoutMs) => createGoogleClient({ ...TEST_GOOGLE, redirectUri: REDIRECT, fetch: fakeGoogle(null, { pictures }).fetch, pictureTimeoutMs: timeoutMs });
  let seen;
  const ok = await withPicture((_url, init) => ((seen = init), new Response(png, { headers: { "content-type": "image/png" } }))).fetchPicture(URL_OK, 1000);
  assert.deepEqual(ok, png);
  assert.equal(seen.redirect, "error", "a redirect could point anywhere, so none is followed");
  assert.ok(seen.signal, "the download has a time limit");
  assert.equal(await withPicture(() => new Response(png)).fetchPicture("https://evil.example/a.png", 1000), null, "bad links are never fetched");
  assert.equal(await withPicture(() => new Response(png)).fetchPicture(URL_OK, 50), null, "bigger than the cap");
  assert.equal(await withPicture(() => new Response(png, { headers: { "content-length": "99999999" } })).fetchPicture(URL_OK, 1000), null, "declared too big");
  assert.equal(await withPicture(() => new Response("gone", { status: 404 })).fetchPicture(URL_OK, 1000), null);
  assert.equal(await withPicture(() => Promise.reject(new TypeError("redirect"))).fetchPicture(URL_OK, 1000), null);
  const hanging = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => {}, 10_000); // see the token endpoint timeout test
      signal.addEventListener("abort", () => (clearTimeout(keepAlive), reject(signal.reason)));
    });
  assert.equal(await withPicture(hanging, 20).fetchPicture(URL_OK, 1000), null, "too slow");
});
