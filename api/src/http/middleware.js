import { HttpError } from "./errors.js";
import { SESSION_COOKIE } from "../auth/sessions.js";

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

// CSRF guard for uploads: a cross-site page cannot set a custom header without a
// CORS preflight, which this API never grants (D16).
export const UPLOAD_HEADER = { name: "x-requested-with", value: "InterviewCompass" };
export function requireUploadHeader(req, _res, next) {
  if (req.headers[UPLOAD_HEADER.name] !== UPLOAD_HEADER.value) {
    return next(new HttpError(403, "UPLOAD_HEADER_REQUIRED", "Uploads must come from the InterviewCompass app."));
  }
  next();
}

export function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sessionCookieOptions({ production, maxAgeMs }) {
  return { httpOnly: true, sameSite: "lax", secure: production, path: "/", ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) };
}

// Loads the signed-in user into req.user. No cookie → 401 UNAUTHENTICATED; a cookie
// whose session is gone or expired → 401 SESSION_EXPIRED (and the cookie is cleared),
// so the web app can say "your session ended" rather than a generic error.
export function requireUser({ sessions, users, production }) {
  return async (req, res, next) => {
    try {
      const token = readCookie(req, SESSION_COOKIE);
      if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
      const found = await sessions.lookup(token);
      // Never load stored files here: this runs on every signed-in request.
      const user = found && (await users.findOne({ _id: found.session.userId }, { projection: { "photo.data": 0, "resume.data": 0 } }));
      if (!user) {
        res.clearCookie(SESSION_COOKIE, sessionCookieOptions({ production }));
        throw new HttpError(401, "SESSION_EXPIRED", "Your session ended. Sign in again to continue.");
      }
      if (found.renewed) res.cookie(SESSION_COOKIE, token, sessionCookieOptions({ production, maxAgeMs: sessions.maxAgeMs }));
      req.user = user;
      req.sessionToken = token;
      next();
    } catch (error) {
      next(error);
    }
  };
}
