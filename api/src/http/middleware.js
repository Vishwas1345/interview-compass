import { HttpError } from "./errors.js";
import { SESSION_COOKIE } from "../auth/sessions.js";

// Mutations must be JSON. A cross-site HTML form can only send form encodings
// without a CORS preflight, so this (with SameSite=Lax cookies) blocks CSRF.
// A body-less POST (logout, resume) is allowed: an HTML form always declares a form
// content type, so it is still refused.
export function requireJson(req, _res, next) {
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const type = req.headers["content-type"];
    const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== undefined;
    if (type ? !/^application\/json\b/i.test(type) : hasBody) {
      return next(new HttpError(415, "JSON_REQUIRED", "Send the request body as application/json."));
    }
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
      const user = found && (await users.findOne({ _id: found.session.userId }));
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
