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
  };
}

// What the kit page gets. Internal fields (checkpoint, dedupe key, owner) stay server-side.
export function kitView(doc) {
  return {
    ...kitSummary(doc),
    input: doc.input,
    progress: doc.progress ?? [],
    error: doc.error ?? null,
    kit: doc.kit ?? null,
    version: doc.version ?? 0,
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

export function kitRoutes({ db, jobs, now = () => new Date() }) {
  const kits = db.collection("kits");
  const router = Router();

  const ownKit = async (req) => {
    if (!ObjectId.isValid(req.params.id)) throw notFound();
    const doc = await kits.findOne({ _id: new ObjectId(req.params.id), userId: req.user._id });
    if (!doc) throw notFound();
    return doc;
  };

  router.get("/", async (req, res) => {
    const docs = await kits
      .find({ userId: req.user._id }, { projection: { status: 1, input: 1, createdAt: 1, "kit.source.company": 1, "kit.role.title": 1 } })
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

  return router;
}

const notFound = () => new HttpError(404, "NOT_FOUND", "Kit not found.");
