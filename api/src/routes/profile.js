// Profile (profile spec): details, photo and résumé. Every route reads req.user, so
// there is no id to guess: a user can only ever reach their own files.

import express, { Router } from "express";
import { z } from "zod";
import { HttpError } from "../http/errors.js";
import { requireUploadHeader } from "../http/middleware.js";
import { profileView } from "../auth/users.js";
import { detectFileType, safeFilename } from "../profile/files.js";

export const PHOTO_MAX_BYTES = 1024 * 1024;
export const RESUME_MAX_BYTES = 4 * 1024 * 1024; // under Vercel's ~4.5 MB proxy body limit
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const WITHOUT_FILES = { projection: { "photo.data": 0, "resume.data": 0 } };

const text = (max, label) => z.string().trim().max(max, `${label} can be at most ${max} characters.`);
const link = z
  .string()
  .trim()
  .max(300, "Links can be at most 300 characters.")
  .refine((v) => v === "" || isWebAddress(v), "Enter a full web address starting with http:// or https://.");
const details = z
  .object({
    name: text(80, "Name"),
    jobTitle: text(100, "Job title"),
    phone: text(30, "Phone").refine((v) => /^[0-9+().\-\s]*$/.test(v), "Use digits, spaces and + ( ) - . only."),
    location: text(100, "Location"),
    linkedin: link,
    website: link,
    bio: text(500, "Bio"),
  })
  .partial()
  .strict();

function isWebAddress(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function profileRoutes({ db, now = () => new Date() }) {
  const users = db.collection("users");
  const router = Router();
  const reload = (req) => users.findOne({ _id: req.user._id }, WITHOUT_FILES);

  router.get("/", (req, res) => res.json({ profile: profileView(req.user) }));

  router.patch("/", async (req, res) => {
    const changes = details.parse(req.body ?? {});
    const $set = Object.fromEntries(Object.entries(changes).map(([k, v]) => [`profile.${k}`, v]));
    if (Object.keys($set).length > 0) await users.updateOne({ _id: req.user._id }, { $set });
    res.json({ profile: profileView(await reload(req)) });
  });

  // --- files ------------------------------------------------------------------

  const upload = (field, { maxBytes, types, tooBig, wrongType, describe }) => [
    requireUploadHeader,
    rawBody(maxBytes, tooBig),
    async (req, res) => {
      const data = req.body;
      if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "UNSUPPORTED_FILE", wrongType);
      const contentType = detectFileType(data);
      if (!types.includes(contentType)) throw new HttpError(400, "UNSUPPORTED_FILE", wrongType);
      await users.updateOne({ _id: req.user._id }, { $set: { [field]: { data, contentType, size: data.length, ...describe(req) } } });
      res.json({ profile: profileView(await reload(req)) });
    },
  ];

  const download = (field, headers) => async (req, res) => {
    const user = await users.findOne({ _id: req.user._id }, { projection: { [field]: 1 } });
    const file = user?.[field];
    if (!file?.data) throw new HttpError(404, "NOT_FOUND", "No file here.");
    // A BSON Binary's buffer can be larger than its content: copy exactly `position` bytes.
    const bytes = Buffer.from(file.data.buffer.subarray(0, file.data.position));
    res.set({
      "Content-Type": file.contentType, // the detected type, never the uploader's
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
      ...headers(file),
    });
    res.end(bytes);
  };

  const remove = (field) => async (req, res) => {
    await users.updateOne({ _id: req.user._id }, { $unset: { [field]: "" } });
    res.json({ profile: profileView(await reload(req)) });
  };

  router.put(
    "/photo",
    ...upload("photo", {
      maxBytes: PHOTO_MAX_BYTES,
      types: PHOTO_TYPES,
      tooBig: "The photo must be 1 MB or smaller.",
      wrongType: "Use a JPEG, PNG or WebP image.",
      describe: () => ({ updatedAt: now() }),
    }),
  );
  router.get("/photo", download("photo", () => ({})));
  router.delete("/photo", remove("photo"));

  router.put(
    "/resume",
    ...upload("resume", {
      maxBytes: RESUME_MAX_BYTES,
      types: ["application/pdf"],
      tooBig: "The résumé must be 4 MB or smaller.",
      wrongType: "Use a PDF file.",
      describe: (req) => ({ filename: safeFilename(req.headers["x-filename"]), uploadedAt: now() }),
    }),
  );
  router.get(
    "/resume",
    download("resume", (file) => ({
      // Always a download, never rendered in our origin; sandboxed if opened anyway.
      "Content-Disposition": `attachment; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Security-Policy": "sandbox",
    })),
  );
  router.delete("/resume", remove("resume"));

  return router;
}

// Raw body with a per-route cap and a friendly message when it is exceeded.
function rawBody(limit, tooBig) {
  const parse = express.raw({ type: () => true, limit });
  return (req, res, next) =>
    parse(req, res, (error) => {
      if (error?.type === "entity.too.large") return next(new HttpError(413, "TOO_LARGE", tooBig));
      next(error);
    });
}
