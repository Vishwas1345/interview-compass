import { HttpError } from "../utils/http-error.js";

// CSRF guard for uploads: a cross-site page cannot set a custom header without a
// CORS preflight, which this API never grants (D16).
export const UPLOAD_HEADER = { name: "x-requested-with", value: "InterviewCompass" };
export function requireUploadHeader(req, _res, next) {
  if (req.headers[UPLOAD_HEADER.name] !== UPLOAD_HEADER.value) {
    return next(new HttpError(403, "UPLOAD_HEADER_REQUIRED", "Uploads must come from the InterviewCompass app."));
  }
  next();
}
