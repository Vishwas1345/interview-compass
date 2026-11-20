import { HttpError } from "../utils/http-error.js";
import { SESSION_COOKIE } from "../services/session.service.js";
import { readCookie, sessionCookieOptions } from "../utils/cookies.js";

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
