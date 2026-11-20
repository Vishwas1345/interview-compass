// Kits: create (duplicates, the daily cap, the one-generation-per-user race), read,
// delete, resume, builder operations (versioned, D13), regeneration requests (D8),
// practice and the answer coach. Errors that carry a kit attach the raw document as
// `error.doc`; the controller turns it into a view, so nothing internal leaks.
import { validateKit } from "@interview-compass/shared";
import { HttpError } from "../utils/http-error.js";
import { isDuplicateKey } from "../utils/mongo.js";
import { dedupeKey } from "./dedupe.service.js";
import { applyOp } from "./kit-ops.service.js";
import { briefHasEdits } from "./kit-merge.service.js";
import { coachAnswer, createCoachLimiter } from "./coach.service.js";

export const MAX_KITS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const withDoc = (error, doc) => Object.assign(error, { doc });
const notFound = () => new HttpError(404, "NOT_FOUND", "Kit not found.");
const notReady = (message = "This kit is not ready yet.") => new HttpError(409, "NOT_READY", message);
const running = (doc) => withDoc(new HttpError(409, "GENERATION_RUNNING", "You already have a kit generating. Wait for it to finish."), doc);
const regenerationRunning = () => new HttpError(409, "REGENERATION_RUNNING", "A regeneration is already running for this kit.");
// A save based on an older copy: the latest kit goes back so the page can reload it.
const conflict = (doc) => withDoc(new HttpError(409, "VERSION_CONFLICT", "This kit changed in another tab; we loaded the latest version."), doc);

// kits: the kit model; jobs: the job runner; coach: { llm, model }.
export function createKitService({ kits, jobs, coach, now = () => new Date() }) {
  const coachLimiter = createCoachLimiter({ now });

  async function getOwned(userId, id) {
    const doc = await kits.findOwned(id, userId);
    if (!doc) throw notFound();
    return doc;
  }
  async function getReady(userId, id, message) {
    const doc = await getOwned(userId, id);
    if (doc.status !== "ready") throw notReady(message);
    return doc;
  }

  const list = (userId) => kits.listSummaries(userId);

  // → { doc, joined } ; joined = the same posting was already generating.
  async function create(userId, { jd, company_url, days, force }) {
    const key = dedupeKey(jd, company_url);
    const joinOrRefuse = (doc) => {
      if (doc.dedupeKey === key) return { doc, joined: true };
      throw running(doc);
    };

    // 1. Something already generating: the same posting joins it (double-click,
    //    second tab); anything else waits its turn.
    const generating = await kits.findGenerating(userId);
    if (generating) return joinOrRefuse(generating);

    // 2. The same posting and company already has a kit: ask before spending a
    //    minute and the shared model budget again.
    if (!force) {
      const existing = await kits.findLatestByKey(userId, key);
      // Still generating: a parallel click inserted it between check 1 and here.
      if (existing?.status === "generating") return joinOrRefuse(existing);
      if (existing) {
        throw withDoc(new HttpError(409, "DUPLICATE", "You already have a kit for this posting and company.", { sameDays: existing.input.days === days }), existing);
      }
    }

    // 3. Daily cap (rolling 24 hours).
    if ((await kits.countCreatedSince(userId, new Date(now().getTime() - DAY_MS))) >= MAX_KITS_PER_DAY) {
      throw new HttpError(429, "DAILY_LIMIT", `You can create up to ${MAX_KITS_PER_DAY} kits a day. Try again tomorrow.`);
    }

    const at = now();
    let doc;
    try {
      doc = await kits.insert({
        userId,
        status: "generating",
        input: { jd, company_url, days },
        dedupeKey: key,
        progress: [],
        checkpoint: {},
        error: null,
        kit: null,
        version: 0,
        createdAt: at,
        updatedAt: at,
      });
    } catch (error) {
      // Lost a race with a parallel request: the database kept exactly one.
      if (!isDuplicateKey(error)) throw error;
      const winner = await kits.findGenerating(userId);
      if (!winner) throw error;
      return joinOrRefuse(winner);
    }
    jobs.start(doc._id);
    return { doc, joined: false };
  }

  async function remove(userId, id) {
    const doc = await getOwned(userId, id);
    await kits.deleteOwned(doc._id, userId);
  }

  // Continue an interrupted or failed generation from its saved steps.
  // → { doc, started } ; started = false when it was already generating.
  async function resume(userId, id) {
    const doc = await getOwned(userId, id);
    if (doc.status === "generating") return { doc, started: false };
    if (!["interrupted", "failed"].includes(doc.status)) throw new HttpError(409, "NOT_RESUMABLE", "This kit is already complete.");
    try {
      await kits.markResumed(doc._id, doc.status, now());
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      throw running(await kits.findGenerating(userId));
    }
    jobs.start(doc._id);
    return { doc: await kits.findById(doc._id), started: true };
  }

  // One builder operation against a known version (D8 rule 5, D13).
  async function applyOperation(userId, id, { version, op }) {
    const doc = await getReady(userId, id, "This kit is not ready to edit yet.");
    if (version !== doc.version) throw conflict(doc);
    const next = applyOp({ kit: doc.kit, counters: doc.counters, dismissed: doc.dismissed, scheduleStale: doc.scheduleStale }, op);
    const days = next.kit.schedule.days_available;
    const check = validateKit(next.kit, { daysRequested: days, coverage: "warn" });
    if (!check.ok) {
      const first = check.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join("; ");
      throw new HttpError(422, "INVALID_KIT", `That change would break the kit (${first}).`);
    }
    const saved = await kits.saveIfVersion(doc._id, userId, version, {
      kit: next.kit,
      counters: next.counters,
      dismissed: next.dismissed,
      scheduleStale: Boolean(next.scheduleStale),
      "input.days": days,
      updatedAt: now(),
    });
    if (!saved) throw conflict(await kits.findById(doc._id));
    return kits.findById(doc._id);
  }

  // Regenerate the brief or one category in the background (D8): the per-kit lock,
  // then the job. Edits keep working meanwhile.
  async function requestRegeneration(userId, id, request) {
    const doc = await getReady(userId, id);
    if (doc.regenerating) throw regenerationRunning();
    if (request.target === "brief" && briefHasEdits(doc.kit) && !request.confirm) {
      throw new HttpError(409, "CONFIRM_REQUIRED", "You edited this brief. Replace it anyway?");
    }
    const locked = await kits.lockRegeneration(doc._id, userId, { target: request.target, category: request.category ?? null, startedAt: now() });
    if (!locked) throw regenerationRunning();
    jobs.regenerate(doc._id, request);
    return kits.findById(doc._id);
  }

  // Practice results live beside the kit: no version bump, no conflict with edits.
  async function recordPractice(userId, id, { itemId, confidence }) {
    const doc = await getReady(userId, id);
    practiceItem(doc.kit, itemId);
    await kits.recordPractice(doc._id, userId, itemId, confidence, now());
    return kits.findPracticeEntry(doc._id, itemId);
  }

  async function coachAnswerFor(userId, id, { itemId, answer }) {
    const doc = await getReady(userId, id);
    const item = practiceItem(doc.kit, itemId);
    if (!coachLimiter.take(String(userId))) {
      throw new HttpError(429, "COACH_LIMIT", "You have used the coach 30 times in the last hour. Try again a little later.");
    }
    const tested = doc.kit.role.requirements.filter((r) => item.requirement_ids.includes(r.id));
    return coachAnswer({ item, requirements: tested, answer, llm: coach.llm, model: coach.model });
  }

  return { list, get: getOwned, create, remove, resume, applyOperation, requestRegeneration, recordPractice, coach: coachAnswerFor };
}

// Practice items are questions (prompt → outline) and flashcards (front → back).
function practiceItem(kit, itemId) {
  const question = kit.questions.find((q) => q.id === itemId);
  if (question) return { prompt: question.prompt, outline: question.answer_outline, requirement_ids: question.requirement_ids };
  const card = kit.flashcards.find((f) => f.id === itemId);
  if (card) return { prompt: card.front, outline: card.back, requirement_ids: card.requirement_ids };
  throw new HttpError(400, "INVALID_ITEM", "That card is no longer in this kit.");
}
