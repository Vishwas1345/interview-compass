import { HttpError } from "../utils/http-error.js";
import { SESSION_COOKIE } from "../services/session.service.js";
import { readCookie, sessionCookieOptions } from "../utils/cookies.js";

// Loads the signed-in user into req.user. No cookie → 401 UNAUTHENTICATED; a cookie
// whose session is gone or expired → 401 SESSION_EXPIRED (and the cookie is cleared),
// so the web app can say "your session ended" rather than a generic error.
// sessions: the session service; users: the user model.
export function requireUser({ sessions, users, production }) {
  return async (req, res, next) => {
    try {
      const token = readCookie(req, SESSION_COOKIE);
      if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
      const found = await sessions.lookup(token);
      // users.findById never loads stored file bytes: this runs on every signed-in request.
      const user = found && (await users.findById(found.session.userId));
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
