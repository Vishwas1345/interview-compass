import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { validateKit } from "@interview-compass/shared";
import { startTestDb, startTestApp, browser, testClock } from "./helpers/app.js";
import { JD, fakeLlm, testPipelineDeps } from "./helpers/fake-llm.js";
import { startFixtureServer } from "./fixtures/server.js";
import { createJobRunner } from "../src/kits/jobs.js";
import { MAX_KITS_PER_DAY } from "../src/routes/kits.js";

let testDb, app, fixtures, jobs, pipelineDeps, clock;
before(async () => {
  testDb = await startTestDb();
  fixtures = await startFixtureServer(0);
  clock = testClock();
  pipelineDeps = testPipelineDeps(fakeLlm()); // tests swap pipelineDeps.llm as needed
  jobs = createJobRunner({ db: testDb.db, pipelineDeps, now: clock.now, log: () => {} });
  app = await startTestApp({ db: testDb.db, jobs, now: clock.now });
});
after(async () => {
  app.close();
  fixtures.server.closeAllConnections();
  fixtures.server.close();
  await testDb.stop();
});

let counter = 0;
async function signedIn() {
  const b = browser(app.origin);
  await b.post("/api/auth/register", { email: `kits${++counter}@example.com`, password: "long enough pw" });
  return b;
}
const posting = (n = 0) => ({ jd: `${JD}\n- Reference ${n}`, company_url: `${fixtures.origin}/acme/`, days: 3 });
const kitsOf = (b) => testDb.db.collection("kits").find({}).toArray().then((all) => all.filter(() => b));

// A model that waits until released, so a generation stays "in progress".
function heldLlm() {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  return { llm: fakeLlm({ gate }), release };
}

test("create → 202, then the kit becomes ready and valid, with progress in order", async () => {
  pipelineDeps.llm = fakeLlm();
  const b = await signedIn();
  const created = await b.post("/api/kits", posting(1));
  assert.equal(created.status, 202);
  assert.equal(created.body.kit.status, "generating");
  await jobs.wait(created.body.kit.id);

  const { body } = await b.get(`/api/kits/${created.body.kit.id}`);
  assert.equal(body.kit.status, "ready");
  assert.equal(validateKit(body.kit.kit, { daysRequested: 3 }).ok, true);
  assert.equal(body.kit.version, 1);
  const done = body.kit.progress.filter((p) => p.status === "done").map((p) => p.step);
  assert.deepEqual(done, ["extract requirements", "research company site", "search public discussion", "write company brief",
    "read interview process", "generate questions", "check coverage", "make flashcards", "kit ready"]);
  assert.equal(body.kit.checkpoint, undefined, "internal fields are not sent to the browser");
  assert.equal(body.kit.company, "Acme Rockets");
});

test("two Generate clicks at the same moment create exactly one kit", async () => {
  const { llm, release } = heldLlm();
  pipelineDeps.llm = llm;
  const b = await signedIn();
  const [first, second] = await Promise.all([b.post("/api/kits", posting(2)), b.post("/api/kits", posting(2))]);
  assert.deepEqual([first.status, second.status].sort(), [200, 202]);
  assert.equal(first.body.kit.id, second.body.kit.id);
  const userId = (await testDb.db.collection("users").findOne({ email: `kits${counter}@example.com` }))._id;
  assert.equal(await testDb.db.collection("kits").countDocuments({ userId }), 1);
  release();
  await jobs.wait(first.body.kit.id);
});

test("a different posting while one is generating is refused with the running kit", async () => {
  const { llm, release } = heldLlm();
  pipelineDeps.llm = llm;
  const b = await signedIn();
  const running = await b.post("/api/kits", posting(3));
  const other = await b.post("/api/kits", posting(4));
  assert.equal(other.status, 409);
  assert.equal(other.body.error.code, "GENERATION_RUNNING");
  assert.equal(other.body.error.existing.id, running.body.kit.id);
  release();
  await jobs.wait(running.body.kit.id);
});

test("the same posting again asks first; force creates a new kit", async () => {
  pipelineDeps.llm = fakeLlm();
  const b = await signedIn();
  const first = await b.post("/api/kits", posting(5));
  await jobs.wait(first.body.kit.id);

  // Different spacing and URL cosmetics still count as the same posting.
  const again = await b.post("/api/kits", { ...posting(5), jd: `  ${posting(5).jd.replace(/\n/g, "\n\n")}  `, company_url: `${fixtures.origin}/acme` });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, "DUPLICATE");
  assert.equal(again.body.error.existing.id, first.body.kit.id);
  assert.equal(again.body.error.sameDays, true);

  const otherDays = await b.post("/api/kits", { ...posting(5), days: 7 });
  assert.equal(otherDays.body.error.sameDays, false);

  const forced = await b.post("/api/kits", { ...posting(5), force: true });
  assert.equal(forced.status, 202);
  assert.notEqual(forced.body.kit.id, first.body.kit.id);
  await jobs.wait(forced.body.kit.id);
});

test(`the ${MAX_KITS_PER_DAY + 1}th kit in 24 hours is refused, and allowed again a day later`, async () => {
  const b = await signedIn();
  const user = await testDb.db.collection("users").findOne({ email: `kits${counter}@example.com` });
  await testDb.db.collection("kits").insertMany(
    Array.from({ length: MAX_KITS_PER_DAY }, (_, i) => ({ userId: user._id, status: "ready", input: { jd: `x${i}`, company_url: "a.com", days: 1 }, dedupeKey: `k${i}`, createdAt: clock.now() })),
  );
  const refused = await b.post("/api/kits", posting(6));
  assert.equal(refused.status, 429);
  assert.equal(refused.body.error.code, "DAILY_LIMIT");
  clock.advance(24 * 60 * 60 * 1000 + 1);
  pipelineDeps.llm = fakeLlm();
  const allowed = await b.post("/api/kits", posting(6));
  assert.equal(allowed.status, 202);
  await jobs.wait(allowed.body.kit.id);
});

test("users see only their own kits: another user's kit is 'not found'", async () => {
  pipelineDeps.llm = fakeLlm();
  const alice = await signedIn();
  const bob = await signedIn();
  const kit = await alice.post("/api/kits", posting(7));
  await jobs.wait(kit.body.kit.id);
  assert.equal((await bob.get(`/api/kits/${kit.body.kit.id}`)).status, 404);
  assert.equal((await bob.del(`/api/kits/${kit.body.kit.id}`)).status, 404);
  assert.equal((await bob.post(`/api/kits/${kit.body.kit.id}/resume`)).status, 404);
  assert.deepEqual((await bob.get("/api/kits")).body.kits, []);
  assert.equal((await alice.get("/api/kits")).body.kits[0].id, kit.body.kit.id);
  assert.equal((await alice.get("/api/kits/not-an-id")).status, 404);
  assert.equal((await alice.get(`/api/kits/${new ObjectId()}`)).status, 404);
});

test("signed out: kit endpoints answer 401", async () => {
  const res = await browser(app.origin).get("/api/kits");
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "UNAUTHENTICATED");
});

test("bad input gets field messages", async () => {
  const b = await signedIn();
  for (const [body, pattern] of [
    [{ ...posting(8), days: 0 }, /days: Days must be from 1 to 365/],
    [{ ...posting(8), days: 2.5 }, /whole number/],
    [{ ...posting(8), jd: "   " }, /Paste the job description/],
    [{ ...posting(8), jd: "x".repeat(20_001) }, /longer than 20000/],
    [{ ...posting(8), company_url: "" }, /company website/],
  ]) {
    const res = await b.post("/api/kits", body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
    assert.match(res.body.error.message, pattern);
  }
});

test("a failed generation records its code; resume retries it", async () => {
  pipelineDeps.llm = fakeLlm({ failLabel: "extract" });
  const b = await signedIn();
  const created = await b.post("/api/kits", posting(9));
  await jobs.wait(created.body.kit.id);
  const failed = (await b.get(`/api/kits/${created.body.kit.id}`)).body.kit;
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.code, "LLM_BAD_OUTPUT");

  pipelineDeps.llm = fakeLlm();
  assert.equal((await b.post(`/api/kits/${created.body.kit.id}/resume`)).status, 202);
  await jobs.wait(created.body.kit.id);
  assert.equal((await b.get(`/api/kits/${created.body.kit.id}`)).body.kit.status, "ready");
  assert.equal((await b.post(`/api/kits/${created.body.kit.id}/resume`)).body.error.code, "NOT_RESUMABLE");
});

test("a restart mid-generation marks the kit interrupted; resume finishes it without re-reading or re-crawling", async () => {
  // Generate once to capture what an interrupted run would have saved.
  pipelineDeps.llm = fakeLlm();
  const b = await signedIn();
  const done = await b.post("/api/kits", posting(10));
  await jobs.wait(done.body.kit.id);
  const kits = testDb.db.collection("kits");
  const full = await kits.findOne({ _id: new ObjectId(done.body.kit.id) });

  // Simulate a restart after research: only extraction and crawl were saved.
  await kits.updateOne(
    { _id: full._id },
    { $set: { status: "generating", kit: null, checkpoint: { role: full.checkpoint.role, crawl: full.checkpoint.crawl }, progress: [] } },
  );
  assert.equal(await jobs.recoverOnBoot(), 1);
  assert.equal((await b.get(`/api/kits/${done.body.kit.id}`)).body.kit.status, "interrupted");

  const llm = fakeLlm();
  pipelineDeps.llm = llm;
  const fetchesBefore = pipelineDeps.fetcher.fetches;
  assert.equal((await b.post(`/api/kits/${done.body.kit.id}/resume`)).status, 202);
  await jobs.wait(done.body.kit.id);

  const resumed = (await b.get(`/api/kits/${done.body.kit.id}`)).body.kit;
  assert.equal(resumed.status, "ready");
  assert.ok(!llm.calls.some((c) => c.label === "extract requirements"), "the posting is not read again");
  assert.equal(pipelineDeps.fetcher.fetches, fetchesBefore, "the website is not crawled again");
  const reused = resumed.progress.filter((p) => p.status === "reused").map((p) => p.step);
  assert.deepEqual(reused, ["extract requirements", "research company site"], "the progress shows what was reused");
});

test("deleting a kit removes it", async () => {
  pipelineDeps.llm = fakeLlm();
  const b = await signedIn();
  const created = await b.post("/api/kits", posting(11));
  await jobs.wait(created.body.kit.id);
  assert.equal((await b.del(`/api/kits/${created.body.kit.id}`)).status, 204);
  assert.equal((await b.get(`/api/kits/${created.body.kit.id}`)).status, 404);
});
