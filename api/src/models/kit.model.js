// Kits (D12, D13). The only code that queries the kits collection. Methods that
// act for a user take that user's id, so ownership is part of every query.

import { ObjectId } from "mongodb";

const size = (path) => ({ $size: { $ifNull: [path, []] } });

// The kit list's counts, computed by MongoDB so whole kits are never loaded.
const SUMMARY_PROJECTION = {
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
};

export function createKitModel(db) {
  const kits = db.collection("kits");
  return {
    async ensureIndexes() {
      await kits.createIndex({ userId: 1, createdAt: -1 }); // the kit list
      await kits.createIndex({ userId: 1, dedupeKey: 1 }); // "you already have a kit for this posting"
      // At most one generating kit per user, enforced by the database: two Generate
      // clicks racing each other cannot both insert (spec: one generation at a time).
      await kits.createIndex({ userId: 1 }, { name: "one_generating_per_user", unique: true, partialFilterExpression: { status: "generating" } });
    },

    // --- reads ------------------------------------------------------------------
    findById: (id) => kits.findOne({ _id: id }),
    // A malformed id is simply "not found".
    findOwned: (id, userId) => (ObjectId.isValid(id) ? kits.findOne({ _id: new ObjectId(id), userId }) : null),
    listSummaries: (userId) => kits.find({ userId }, { projection: SUMMARY_PROJECTION }).sort({ createdAt: -1 }).limit(200).toArray(),
    findGenerating: (userId) => kits.findOne({ userId, status: "generating" }),
    findLatestByKey: (userId, dedupeKey) => kits.findOne({ userId, dedupeKey, status: { $ne: "failed" } }, { sort: { createdAt: -1 } }),
    countCreatedSince: (userId, since) => kits.countDocuments({ userId, createdAt: { $gt: since } }),
    async findPracticeEntry(id, itemId) {
      return (await kits.findOne({ _id: id }, { projection: { [`practice.${itemId}`]: 1 } }))?.practice?.[itemId] ?? null;
    },

    // --- writes for a user ------------------------------------------------------
    async insert(doc) {
      const { insertedId } = await kits.insertOne(doc);
      return { ...doc, _id: insertedId };
    },
    deleteOwned: (id, userId) => kits.deleteOne({ _id: id, userId }),
    deleteAllForUser: (userId) => kits.deleteMany({ userId }),
    // Back to generating from a stopped state; the unique index may refuse it.
    markResumed: (id, fromStatus, at) =>
      kits.updateOne(
        { _id: id, status: fromStatus },
        { $set: { status: "generating", error: null, updatedAt: at }, $push: { progress: { step: "resumed", status: "started", at } } },
      ),
    // Optimistic concurrency (D13): saves only if nobody saved since `version`.
    async saveIfVersion(id, userId, version, $set) {
      const result = await kits.updateOne({ _id: id, userId, version }, { $set, $inc: { version: 1 } });
      return result.matchedCount === 1;
    },
    // The per-kit regeneration lock.
    async lockRegeneration(id, userId, regenerating) {
      const result = await kits.updateOne({ _id: id, userId, status: "ready", regenerating: null }, { $set: { regenerating } });
      return result.matchedCount === 1;
    },
    recordPractice: (id, userId, itemId, confidence, at) =>
      kits.updateOne(
        { _id: id, userId },
        { $set: { [`practice.${itemId}.confidence`]: confidence, [`practice.${itemId}.lastAt`]: at }, $inc: { [`practice.${itemId}.count`]: 1 } },
      ),

    // --- writes by the background jobs ------------------------------------------
    pushProgress: (id, event) => kits.updateOne({ _id: id }, { $push: { progress: event } }),
    saveCheckpoint: (id, step, result, at) => kits.updateOne({ _id: id }, { $set: { [`checkpoint.${step}`]: result, updatedAt: at } }),
    markReady: (id, $set, event) => kits.updateOne({ _id: id, status: "generating" }, { $set: { ...$set, status: "ready" }, $push: { progress: event } }),
    markFailed: (id, error, event, at) => kits.updateOne({ _id: id, status: "generating" }, { $set: { status: "failed", error, updatedAt: at }, $push: { progress: event } }),
    async interruptAllGenerating(event, at) {
      return (await kits.updateMany({ status: "generating" }, { $set: { status: "interrupted", updatedAt: at }, $push: { progress: event } })).modifiedCount;
    },
    async saveRegenerationIfVersion(id, version, $set) {
      const result = await kits.updateOne({ _id: id, version }, { $set: { ...$set, regenerating: null }, $inc: { version: 1 } });
      return result.matchedCount === 1;
    },
    failRegeneration: (id, lastRegeneration) => kits.updateOne({ _id: id }, { $set: { regenerating: null, lastRegeneration } }),
    async clearStuckRegenerations(lastRegeneration) {
      return (await kits.updateMany({ regenerating: { $ne: null }, status: "ready" }, { $set: { regenerating: null, lastRegeneration } })).modifiedCount;
    },
  };
}
