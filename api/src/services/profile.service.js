// Profile details, photo and résumé (profile spec, D16). Files are checked by
// their bytes; the résumé is stored and never read.
import { HttpError } from "../utils/http-error.js";
import { detectFileType, safeFilename } from "./file.service.js";

export const PHOTO_MAX_BYTES = 1024 * 1024;
export const RESUME_MAX_BYTES = 4 * 1024 * 1024; // under Vercel's ~4.5 MB proxy body limit

// What each file field accepts.
export const FILE_RULES = {
  photo: {
    maxBytes: PHOTO_MAX_BYTES,
    types: ["image/jpeg", "image/png", "image/webp"],
    tooBig: "The photo must be 1 MB or smaller.",
    wrongType: "Use a JPEG, PNG or WebP image.",
  },
  resume: {
    maxBytes: RESUME_MAX_BYTES,
    types: ["application/pdf"],
    tooBig: "The résumé must be 4 MB or smaller.",
    wrongType: "Use a PDF file.",
  },
};

// users: the user model.
export function createProfileService({ users, now = () => new Date() }) {
  async function updateDetails(userId, fields) {
    await users.updateProfile(userId, fields);
    return users.findById(userId);
  }

  // field: "photo" | "resume"; meta.filename for the résumé.
  async function uploadFile(userId, field, data, meta = {}) {
    const rule = FILE_RULES[field];
    if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "UNSUPPORTED_FILE", rule.wrongType);
    const contentType = detectFileType(data);
    if (!rule.types.includes(contentType)) throw new HttpError(400, "UNSUPPORTED_FILE", rule.wrongType);
    const describe = field === "photo" ? { updatedAt: now() } : { filename: safeFilename(meta.filename), uploadedAt: now() };
    await users.setFile(userId, field, { data, contentType, size: data.length, ...describe });
    return users.findById(userId);
  }

  // → { bytes, contentType, filename? }
  async function readFile(userId, field) {
    const file = await users.getFile(userId, field);
    if (!file?.data) throw new HttpError(404, "NOT_FOUND", "No file here.");
    // A BSON Binary's buffer can be larger than its content: copy exactly `position` bytes.
    return { bytes: Buffer.from(file.data.buffer.subarray(0, file.data.position)), contentType: file.contentType, filename: file.filename };
  }

  async function removeFile(userId, field) {
    await users.removeFile(userId, field);
    return users.findById(userId);
  }

  return { updateDetails, uploadFile, readFile, removeFile };
}
