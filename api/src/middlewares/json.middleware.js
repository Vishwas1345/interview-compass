import { HttpError } from "../utils/http-error.js";

// Mutations must be JSON. A cross-site HTML form can only send form encodings
// without a CORS preflight, so this (with SameSite=Lax cookies) blocks CSRF.
// A body-less POST (logout, resume) is allowed: an HTML form always declares a form
// content type, so it is still refused.
// File uploads (PUT /api/profile/photo|resume) send raw bytes instead; they are
// guarded by requireUploadHeader.
export const UPLOAD_PATHS = new Set(["/profile/photo", "/profile/resume"]);

export function requireJson(req, _res, next) {
  if (req.method === "PUT" && UPLOAD_PATHS.has(req.path)) return next();
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const type = req.headers["content-type"];
    const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== undefined;
    if (type ? !/^application\/json\b/i.test(type) : hasBody) {
      return next(new HttpError(415, "JSON_REQUIRED", "Send the request body as application/json."));
    }
  }
  next();
}
