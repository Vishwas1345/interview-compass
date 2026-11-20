// Kit generation as a background job (D12). The kit document is the job's state:
// progress, saved step results (for resume), the final kit or the error. The page
// polls the document, so a reload or another device sees the same progress.

import { runPipeline } from "../pipeline/run-pipeline.js";
import { ERROR_CODES } from "../pipeline/errors.js";

export function createJobRunner({ db, pipelineDeps, now = () => new Date(), log = console.error }) {
  const kits = db.collection("kits");
  const running = new Map(); // kitId string → promise

  const progressEvent = (event) => ({ ...event, at: now() });

  // Starts (or continues, from the saved checkpoint) the generation of a kit whose
  // status is already "generating". Returns the job's promise (tests await it).
  function start(kitId) {
    const key = String(kitId);
    if (running.has(key)) return running.get(key);
    const job = run(kitId).finally(() => running.delete(key));
    running.set(key, job);
    return job;
  }

  async function run(kitId) {
    const doc = await kits.findOne({ _id: kitId });
    if (!doc || doc.status !== "generating") return;
    const started = Date.now();
    // Progress writes are chained so they land in order, and flushed before the
    // final status write. A failed progress write never breaks the pipeline.
    let progressChain = Promise.resolve();
    const pushProgress = (event) => {
      progressChain = progressChain
        .then(() => kits.updateOne({ _id: kitId }, { $push: { progress: progressEvent(event) } }))
        .catch(() => {});
    };
    try {
      const { kit } = await runPipeline(doc.input, {
        ...pipelineDeps,
        checkpoint: doc.checkpoint ?? {},
        onCheckpoint: (step, result) => kits.updateOne({ _id: kitId }, { $set: { [`checkpoint.${step}`]: result, updatedAt: now() } }),
        onProgress: pushProgress,
      });
      await progressChain;
      await kits.updateOne(
        { _id: kitId, status: "generating" },
        {
          $set: {
            status: "ready",
            kit,
            version: 1,
            counters: { q: highestId(kit.questions, "q"), f: highestId(kit.flashcards, "f") },
            error: null,
            completedAt: now(),
            updatedAt: now(),
          },
          $push: { progress: progressEvent({ step: "kit ready", status: "done", ms: Date.now() - started }) },
        },
      );
    } catch (error) {
      const code = error?.code && ERROR_CODES[error.code] ? error.code : ERROR_CODES.INTERNAL_ERROR;
      const message = code === ERROR_CODES.INTERNAL_ERROR ? "Something went wrong while generating this kit." : error.message;
      if (code === ERROR_CODES.INTERNAL_ERROR) log(`kit ${kitId} failed: ${error?.stack ?? error}`);
      await progressChain;
      await kits.updateOne(
        { _id: kitId, status: "generating" },
        {
          $set: { status: "failed", error: { code, message }, updatedAt: now() },
          $push: { progress: progressEvent({ step: "failed", status: "failed", message }) },
        },
      );
    }
  }

  // One process runs every job (D9: a single Render instance), so on startup any
  // kit still marked "generating" lost its job in the restart.
  async function recoverOnBoot() {
    const result = await kits.updateMany(
      { status: "generating" },
      {
        $set: { status: "interrupted", updatedAt: now() },
        $push: { progress: progressEvent({ step: "interrupted", status: "failed", message: "The server restarted during generation." }) },
      },
    );
    return result.modifiedCount;
  }

  return { start, recoverOnBoot, wait: (kitId) => running.get(String(kitId)) ?? Promise.resolve(), running };
}

// The builder numbers new items after the highest id ever used, so an id is never
// reused (D8). The highest id, not the count: the gap pass can leave gaps.
export function highestId(items, prefix) {
  let highest = 0;
  for (const item of items) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(item.id ?? "");
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}
