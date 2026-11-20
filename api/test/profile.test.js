import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, startTestApp, browser } from "./helpers/app.js";
import { detectFileType, safeFilename } from "../src/services/file.service.js";

let testDb, app;
before(async () => {
  testDb = await startTestDb();
  app = await startTestApp({ db: testDb.db });
});
after(async () => {
  app.close();
  await testDb.stop();
});

const PASSWORD = "long enough pw";
let counter = 0;
async function signedIn() {
  const b = browser(app.origin);
  const email = `profile${++counter}@example.com`;
  await b.post("/api/auth/register", { email, password: PASSWORD });
  return Object.assign(b, { email });
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(600 * 1024, 7)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from(Array.from({ length: 300_000 }, (_, i) => i % 251))]);

// Raw upload, as the web app sends it.
async function upload(b, path, body, { type = "application/octet-stream", header = true, filename } = {}) {
  const cookie = [...b.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const response = await fetch(app.origin + path, {
    method: "PUT",
    headers: { Cookie: cookie, "Content-Type": type, ...(header ? { "X-Requested-With": "InterviewCompass" } : {}), ...(filename ? { "X-Filename": encodeURIComponent(filename) } : {}) },
    body,
  });
  return { status: response.status, body: await response.json() };
}
async function download(b, path) {
  const cookie = [...b.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const response = await fetch(app.origin + path, { headers: { Cookie: cookie } });
  return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) };
}

test("a new account has an empty profile; details save, trim and show in /me", async () => {
  const b = await signedIn();
  const empty = (await b.get("/api/profile")).body.profile;
  assert.deepEqual([empty.name, empty.photo, empty.resume], ["", null, null]);
  const saved = await b.raw("PATCH", "/api/profile", { name: "  Vishwas  ", jobTitle: "Backend Engineer", linkedin: "https://linkedin.com/in/x", phone: "+91 (98) 765-4321" });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.profile.name, "Vishwas");
  const me = (await b.get("/api/auth/me")).body.user;
  assert.deepEqual([me.name, me.jobTitle, me.photoVersion], ["Vishwas", "Backend Engineer", null]);
});

test("bad details are refused with field messages and nothing is saved", async () => {
  const b = await signedIn();
  for (const [body, pattern] of [
    [{ phone: "call me maybe" }, /digits, spaces/],
    [{ linkedin: "javascript:alert(1)" }, /http:\/\/ or https:\/\//],
    [{ website: "example.com" }, /http:\/\/ or https:\/\//],
    [{ bio: "x".repeat(501) }, /at most 500/],
    [{ isAdmin: true }, /Unrecognized key|unrecognized/i],
  ]) {
    const res = await b.raw("PATCH", "/api/profile", body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.error.message, pattern);
  }
  assert.equal((await b.get("/api/profile")).body.profile.phone, "");
});

test("a PNG photo is stored, served with its detected type and nosniff, and removable", async () => {
  const b = await signedIn();
  const res = await upload(b, "/api/profile/photo", PNG, { type: "image/png" });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.profile.photo.contentType, res.body.profile.photo.size], ["image/png", PNG.length]);
  assert.ok(res.body.profile.user.photoVersion, "the sidebar learns there is a photo");
  const served = await download(b, "/api/profile/photo");
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.equal(served.headers.get("x-content-type-options"), "nosniff");
  assert.ok(served.bytes.equals(PNG), "byte for byte");
  assert.equal((await b.del("/api/profile/photo")).status, 200);
  assert.equal((await download(b, "/api/profile/photo")).status, 404);
});

test("the declared type is ignored: a text file named .png, or a PDF as a photo, is refused", async () => {
  const b = await signedIn();
  const fake = await upload(b, "/api/profile/photo", Buffer.from("<script>alert(1)</script>"), { type: "image/png" });
  assert.equal(fake.status, 400);
  assert.equal(fake.body.error.message, "Use a JPEG, PNG or WebP image.");
  assert.equal((await upload(b, "/api/profile/photo", PDF, { type: "image/png" })).status, 400);
  assert.equal((await upload(b, "/api/profile/resume", PNG, { type: "application/pdf" })).body.error.message, "Use a PDF file.");
});

test("files over the cap are refused with the right message", async () => {
  const b = await signedIn();
  const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
  const res = await upload(b, "/api/profile/photo", big, { type: "image/png" });
  assert.equal(res.status, 413);
  assert.equal(res.body.error.message, "The photo must be 1 MB or smaller.");
  const bigPdf = Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024)]);
  assert.equal((await upload(b, "/api/profile/resume", bigPdf)).body.error.message, "The résumé must be 4 MB or smaller.");
});

test("an upload without the app's header is refused (cross-site guard)", async () => {
  const b = await signedIn();
  const res = await upload(b, "/api/profile/photo", PNG, { header: false });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "UPLOAD_HEADER_REQUIRED");
});

test("a résumé round-trips byte for byte as a sandboxed download; a new one replaces it; remove deletes it", async () => {
  const b = await signedIn();
  const res = await upload(b, "/api/profile/resume", PDF, { type: "application/pdf", filename: "../../etc/Vishwas CV \"2026\".pdf" });
  assert.equal(res.status, 200);
  assert.equal(res.body.profile.resume.filename, "Vishwas CV 2026.pdf", "no path, no quotes");
  const got = await download(b, "/api/profile/resume");
  assert.ok(got.bytes.equals(PDF));
  assert.equal(got.headers.get("content-type"), "application/pdf");
  assert.match(got.headers.get("content-disposition"), /^attachment;/);
  assert.equal(got.headers.get("content-security-policy"), "sandbox");
  const second = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("second")]);
  await upload(b, "/api/profile/resume", second, { filename: "new.pdf" });
  assert.ok((await download(b, "/api/profile/resume")).bytes.equals(second));
  await b.del("/api/profile/resume");
  assert.equal((await b.get("/api/profile")).body.profile.resume, null);
});

test("another user never reaches someone else's files", async () => {
  const alice = await signedIn();
  await upload(alice, "/api/profile/photo", PNG);
  await upload(alice, "/api/profile/resume", PDF);
  const bob = await signedIn();
  assert.equal((await download(bob, "/api/profile/photo")).status, 404);
  assert.equal((await download(bob, "/api/profile/resume")).status, 404);
  assert.equal((await download(browser(app.origin), "/api/profile/resume")).status, 401);
});

test("signed-in requests never load stored file bytes", async () => {
  const b = await signedIn();
  await upload(b, "/api/profile/resume", PDF);
  // Watch the queries the sign-in check actually sends.
  const finds = [];
  const listen = (event) => event.commandName === "find" && event.command.find === "users" && finds.push(event.command.projection);
  testDb.client.on("commandStarted", listen);
  try {
    await b.get("/api/auth/me");
  } finally {
    testDb.client.off("commandStarted", listen);
  }
  assert.ok(finds.length > 0);
  for (const projection of finds) assert.deepEqual(projection, { "photo.data": 0, "resume.data": 0 });
  const me = await b.get("/api/auth/me");
  assert.ok(JSON.stringify(me.body).length < 500, "no file data in /me");
});

test("email change needs the current password and a free address; the new email signs in", async () => {
  const b = await signedIn();
  const taken = await signedIn();
  assert.equal((await b.post("/api/account/email", { email: "new@example.com", currentPassword: "wrong" })).body.error.code, "WRONG_PASSWORD");
  assert.equal((await b.post("/api/account/email", { email: taken.email, currentPassword: PASSWORD })).body.error.code, "EMAIL_TAKEN");
  const ok = await b.post("/api/account/email", { email: "  NEW1@Example.com ", currentPassword: PASSWORD });
  assert.equal(ok.body.user.email, "new1@example.com");
  assert.equal((await browser(app.origin).post("/api/auth/login", { email: "new1@example.com", password: PASSWORD })).status, 200);
  assert.equal((await browser(app.origin).post("/api/auth/login", { email: b.email, password: PASSWORD })).status, 401);
});

test("password change signs out other devices, keeps this one, and the new password works", async () => {
  const laptop = await signedIn();
  const phone = browser(app.origin);
  await phone.post("/api/auth/login", { email: laptop.email, password: PASSWORD });
  assert.equal((await laptop.post("/api/account/password", { currentPassword: "nope", newPassword: "another long one" })).status, 401);
  assert.equal((await laptop.post("/api/account/password", { currentPassword: PASSWORD, newPassword: "short" })).status, 400);
  assert.equal((await laptop.post("/api/account/password", { currentPassword: PASSWORD, newPassword: "another long one" })).status, 204);
  assert.equal((await laptop.get("/api/auth/me")).status, 200, "this device stays signed in");
  assert.equal((await phone.get("/api/auth/me")).body.error.code, "SESSION_EXPIRED", "the other device is signed out");
  assert.equal((await browser(app.origin).post("/api/auth/login", { email: laptop.email, password: "another long one" })).status, 200);
});

test("deleting the account removes the user, kits, sessions and files", async () => {
  const b = await signedIn();
  await upload(b, "/api/profile/photo", PNG);
  const user = await testDb.db.collection("users").findOne({ email: b.email });
  await testDb.db.collection("kits").insertOne({ userId: user._id, status: "ready", input: { jd: "x", company_url: "a", days: 1 }, createdAt: new Date() });
  assert.equal((await b.post("/api/account/delete", { password: "wrong" })).status, 401);
  assert.equal((await b.post("/api/account/delete", { password: PASSWORD })).status, 204);
  assert.equal(await testDb.db.collection("users").countDocuments({ _id: user._id }), 0);
  assert.equal(await testDb.db.collection("kits").countDocuments({ userId: user._id }), 0);
  assert.equal(await testDb.db.collection("sessions").countDocuments({ userId: user._id }), 0);
  assert.equal((await browser(app.origin).post("/api/auth/login", { email: b.email, password: PASSWORD })).status, 401);
});

test("file type comes from the bytes; filenames are cleaned", () => {
  assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])), "image/jpeg");
  assert.equal(detectFileType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(detectFileType(Buffer.from("GIF89a......")), null);
  assert.equal(safeFilename("C%3A%5Cfakepath%5Ccv.pdf"), "cv.pdf");
  assert.equal(safeFilename("%E0%A4"), "resume.pdf", "malformed encoding");
  assert.equal(safeFilename("notes.txt"), "notes.txt.pdf");
});
