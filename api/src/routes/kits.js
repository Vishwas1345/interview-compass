// Kits: list, create (starts generation), read, delete, resume (spec: Creating and
// generating a kit). Every query carries userId, so another user's kit is simply
// "not found" (spec: Permissions).

import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { DAYS_MIN, DAYS_MAX } from "@interview-compass/shared";
import { HttpError } from "../http/errors.js";
import { MAX_JD_CHARS } from "../pipeline/extraction/extract-requirements.js";
import { dedupeKey } from "../kits/dedupe.js";
import { applyOp } from "../kits/ops.js";
import { briefHasEdits } from "../kits/merge.js";
import { coachAnswer, createCoachLimiter, ANSWER_MAX } from "../coach/coach.js";
import { QUESTION_CATEGORIES } from "@interview-compass/shared";
import { validateKit } from "@interview-compass/shared";

export const MAX_KITS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const createBody = z.object({
  jd: z.string().trim().min(1, "Paste the job description.").max(MAX_JD_CHARS, `The job description is longer than ${MAX_JD_CHARS} characters.`),
  company_url: z.string().trim().min(1, "Enter the company website.").max(2000, "The website address is too long."),
  days: z.int("Days must be a whole number.").min(DAYS_MIN, `Days must be from ${DAYS_MIN} to ${DAYS_MAX}.`).max(DAYS_MAX, `Days must be from ${DAYS_MIN} to ${DAYS_MAX}.`),
  force: z.boolean().optional(),
});

// What the list shows.
export function kitSummary(doc) {
  return {
    id: String(doc._id),
    status: doc.status,
    company: doc.kit?.source.company || hostOf(doc.input.company_url),
    role: doc.kit?.role.title || "",
    days: doc.input.days,
    createdAt: doc.createdAt,
    ...(doc.counts ? { counts: doc.counts } : {}),
  };
}

// What the kit page gets. Internal fields (checkpoint, dedupe key, owner) stay server-side.
export function kitView(doc) {
  const check = doc.kit ? validateKit(doc.kit, { coverage: "warn" }) : null;
  return {
    ...kitSummary(doc),
    input: doc.input,
    progress: doc.progress ?? [],
    error: doc.error ?? null,
    kit: doc.kit ?? null,
    version: doc.version ?? 0,
    warnings: check?.warnings ?? [],
    scheduleStale: Boolean(doc.scheduleStale),
    regenerating: doc.regenerating ?? null,
    lastRegeneration: doc.lastRegeneration ?? null,
    practice: doc.practice ?? {},
    updatedAt: doc.updatedAt,
    completedAt: doc.completedAt ?? null,
  };
}

function hostOf(url) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return String(url);
  }
}

// coach: { llm, model } for the answer coach (the fast model).
export function kitRoutes({ db, jobs, coach, now = () => new Date() }) {
  const kits = db.collection("kits");
  const router = Router();
  const coachLimiter = createCoachLimiter({ now });

  const ownKit = async (req) => {
    if (!ObjectId.isValid(req.params.id)) throw notFound();
    const doc = await kits.findOne({ _id: new ObjectId(req.params.id), userId: req.user._id });
    if (!doc) throw notFound();
    return doc;
  };

  router.get("/", async (req, res) => {
    // Counts are computed by MongoDB (projection expressions), so the list never
    // loads whole kits: a few bytes per kit instead of ~50 KB.
    const size = (path) => ({ $size: { $ifNull: [path, []] } });
    const docs = await kits
      .find(
        { userId: req.user._id },
        {
          projection: {
            status: 1,
            input: 1,
            createdAt: 1,
            "kit.source.company": 1,
            "kit.role.title": 1,
            counts: {
              requirements: size("$kit.role.requirements"),
              musts: { $size: { $filter: { input: { $ifNull: ["$kit.role.requirements", []] }, cond: { $eq: ["$$this.priority", "must"] } } } },
              questions: size("$kit.questions"),
              flashcards: size("$kit.flashcards"),
              gotIt: { $size: { $filter: { input: { $objectToArray: { $ifNull: ["$practice", {}] } }, cond: { $eq: ["$$this.v.confidence", 3] } } } },
            },
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    res.json({ kits: docs.map(kitSummary) });
  });

  router.post("/", async (req, res) => {
    const { jd, company_url, days, force } = createBody.parse(req.body ?? {});
    const userId = req.user._id;
    const key = dedupeKey(jd, company_url);

    // 1. Something already generating: the same posting joins it (double-click,
    //    second tab); anything else waits its turn.
    const running = await kits.findOne({ userId, status: "generating" });
    if (running) return joinOrRefuse(res, running, key);

    // 2. The same posting and company already has a kit: ask before spending a minute
    //    and the shared model budget again.
    if (!force) {
      const existing = await kits.findOne({ userId, dedupeKey: key, status: { $ne: "failed" } }, { sort: { createdAt: -1 } });
      // Still generating: a parallel click inserted it between check 1 and here.
      if (existing?.status === "generating") return joinOrRefuse(res, existing, key);
      if (existing) {
        throw new HttpError(409, "DUPLICATE", "You already have a kit for this posting and company.", {
          existing: kitSummary(existing),
          sameDays: existing.input.days === days,
        });
      }
    }

    // 3. Daily cap (rolling 24 hours).
    const since = new Date(now().getTime() - DAY_MS);
    if ((await kits.countDocuments({ userId, createdAt: { $gt: since } })) >= MAX_KITS_PER_DAY) {
      throw new HttpError(429, "DAILY_LIMIT", `You can create up to ${MAX_KITS_PER_DAY} kits a day. Try again tomorrow.`);
    }

    const at = now();
    const doc = {
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
    };
    try {
      doc._id = (await kits.insertOne(doc)).insertedId;
    } catch (error) {
      // Lost a race with a parallel request: the database kept exactly one.
      if (error?.code !== 11000) throw error;
      const winner = await kits.findOne({ userId, status: "generating" });
      if (!winner) throw error;
      return joinOrRefuse(res, winner, key);
    }
    jobs.start(doc._id);
    res.status(202).json({ kit: kitView(doc) });
  });

  function joinOrRefuse(res, running, key) {
    if (running.dedupeKey === key) return res.status(200).json({ kit: kitView(running), joined: true });
    throw new HttpError(409, "GENERATION_RUNNING", "You already have a kit generating. Wait for it to finish.", {
      existing: kitSummary(running),
    });
  }

  router.get("/:id", async (req, res) => {
    res.json({ kit: kitView(await ownKit(req)) });
  });

  router.delete("/:id", async (req, res) => {
    const doc = await ownKit(req);
    await kits.deleteOne({ _id: doc._id, userId: req.user._id });
    res.status(204).end();
  });

  // Continue an interrupted or failed generation from its saved steps.
  router.post("/:id/resume", async (req, res) => {
    const doc = await ownKit(req);
    if (doc.status === "generating") return res.status(200).json({ kit: kitView(doc) });
    if (!["interrupted", "failed"].includes(doc.status)) {
      throw new HttpError(409, "NOT_RESUMABLE", "This kit is already complete.");
    }
    try {
      await kits.updateOne(
        { _id: doc._id, status: doc.status },
        {
          $set: { status: "generating", error: null, updatedAt: now() },
          $push: { progress: { step: "resumed", status: "started", at: now() } },
        },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const running = await kits.findOne({ userId: req.user._id, status: "generating" });
      throw new HttpError(409, "GENERATION_RUNNING", "You already have a kit generating. Wait for it to finish.", {
        existing: running ? kitSummary(running) : null,
      });
    }
    jobs.start(doc._id);
    res.status(202).json({ kit: kitView(await kits.findOne({ _id: doc._id })) });
  });

  // One builder operation against a known version (D8 rule 5: optimistic concurrency).
  router.post("/:id/ops", async (req, res) => {
    const { version, op } = opsBody.parse(req.body ?? {});
    const doc = await ownKit(req);
    if (doc.status !== "ready") throw new HttpError(409, "NOT_READY", "This kit is not ready to edit yet.");
    if (version !== doc.version) throw conflict(doc);

    const next = applyOp({ kit: doc.kit, counters: doc.counters, dismissed: doc.dismissed, scheduleStale: doc.scheduleStale }, op);
    const days = next.kit.schedule.days_available;
    const check = validateKit(next.kit, { daysRequested: days, coverage: "warn" });
    if (!check.ok) {
      const first = check.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join("; ");
      throw new HttpError(422, "INVALID_KIT", `That change would break the kit (${first}).`);
    }
    const update = {
      kit: next.kit,
      counters: next.counters,
      dismissed: next.dismissed,
      scheduleStale: Boolean(next.scheduleStale),
      "input.days": days,
      updatedAt: now(),
    };
    const result = await kits.updateOne({ _id: doc._id, userId: req.user._id, version }, { $set: update, $inc: { version: 1 } });
    if (result.matchedCount === 0) throw conflict(await kits.findOne({ _id: doc._id }));
    res.json({ kit: kitView(await kits.findOne({ _id: doc._id })) });
  });

  // Regenerate the brief or one question category in the background (D8). Edits
  // keep working meanwhile; the result is merged into the kit as it is then.
  router.post("/:id/regenerate", async (req, res) => {
    const request = regenerateBody.parse(req.body ?? {});
    const doc = await ownKit(req);
    if (doc.status !== "ready") throw new HttpError(409, "NOT_READY", "This kit is not ready yet.");
    if (doc.regenerating) throw regenerationRunning();
    if (request.target === "brief" && briefHasEdits(doc.kit) && !request.confirm) {
      throw new HttpError(409, "CONFIRM_REQUIRED", "You edited this brief. Replace it anyway?");
    }
    // The lock: only one regeneration per kit at a time.
    const locked = await kits.updateOne(
      { _id: doc._id, userId: req.user._id, status: "ready", regenerating: null },
      { $set: { regenerating: { target: request.target, category: request.category ?? null, startedAt: now() } } },
    );
    if (locked.matchedCount === 0) throw regenerationRunning();
    jobs.regenerate(doc._id, request);
    res.status(202).json({ kit: kitView(await kits.findOne({ _id: doc._id })) });
  });

  // Practice results live beside the kit, not in it: recording a card neither bumps
  // the version nor conflicts with builder saves (spec: Practice).
  router.post("/:id/practice", async (req, res) => {
    const { itemId, confidence } = practiceBody.parse(req.body ?? {});
    const doc = await ownKit(req);
    if (doc.status !== "ready") throw new HttpError(409, "NOT_READY", "This kit is not ready yet.");
    findPracticeItem(doc.kit, itemId);
    const at = now();
    await kits.updateOne(
      { _id: doc._id, userId: req.user._id },
      { $set: { [`practice.${itemId}.confidence`]: confidence, [`practice.${itemId}.lastAt`]: at }, $inc: { [`practice.${itemId}.count`]: 1 } },
    );
    const updated = await kits.findOne({ _id: doc._id }, { projection: { [`practice.${itemId}`]: 1 } });
    res.json({ itemId, entry: updated.practice[itemId] });
  });

  router.post("/:id/coach", async (req, res) => {
    const { itemId, answer } = coachBody.parse(req.body ?? {});
    const doc = await ownKit(req);
    if (doc.status !== "ready") throw new HttpError(409, "NOT_READY", "This kit is not ready yet.");
    const item = findPracticeItem(doc.kit, itemId);
    if (!coachLimiter.take(String(req.user._id))) {
      throw new HttpError(429, "COACH_LIMIT", "You have used the coach 30 times in the last hour. Try again a little later.");
    }
    const tested = doc.kit.role.requirements.filter((r) => item.requirement_ids.includes(r.id));
    const feedback = await coachAnswer({ item, requirements: tested, answer, llm: coach.llm, model: coach.model });
    res.json({ itemId, feedback });
  });

  return router;
}

// Practice items are questions (prompt → outline) and flashcards (front → back).
function findPracticeItem(kit, itemId) {
  const question = kit.questions.find((q) => q.id === itemId);
  if (question) return { prompt: question.prompt, outline: question.answer_outline, requirement_ids: question.requirement_ids };
  const card = kit.flashcards.find((f) => f.id === itemId);
  if (card) return { prompt: card.front, outline: card.back, requirement_ids: card.requirement_ids };
  throw new HttpError(400, "INVALID_ITEM", "That card is no longer in this kit.");
}

// Item ids become part of a field path, so only q<n>/f<n> are accepted.
const itemId = z.string().regex(/^[qf]\d{1,6}$/, "Unknown card.");
const practiceBody = z.object({ itemId, confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]) });
const coachBody = z.object({ itemId, answer: z.string().trim().min(1, "Type an answer first.").max(ANSWER_MAX, `Answers are limited to ${ANSWER_MAX} characters.`) });

const regenerateBody = z.discriminatedUnion("target", [
  z.object({ target: z.literal("brief"), confirm: z.boolean().optional() }),
  z.object({ target: z.literal("category"), category: z.enum(QUESTION_CATEGORIES) }),
]);
const regenerationRunning = () => new HttpError(409, "REGENERATION_RUNNING", "A regeneration is already running for this kit.");

const opsBody = z.object({ version: z.int().min(1), op: z.object({ type: z.string() }).loose() });

// A save based on an older copy: the latest kit comes back so the page can reload it.
const conflict = (doc) =>
  new HttpError(409, "VERSION_CONFLICT", "This kit changed in another tab; we loaded the latest version.", { kit: kitView(doc) });

const notFound = () => new HttpError(404, "NOT_FOUND", "Kit not found.");
