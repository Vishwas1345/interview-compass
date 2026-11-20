// Sign-up, sign-in, sign-out, and who is signed in. Sessions become cookies here.
import { loginBody, registerBody } from "../validators/auth.validator.js";
import { publicUser } from "../views/user.view.js";
import { SESSION_COOKIE } from "../services/session.service.js";
import { readCookie, sessionCookieOptions } from "../utils/cookies.js";

export function createAuthController({ auth, sessions, production }) {
  async function startSession(res, user) {
    const { token, maxAgeMs } = await sessions.create(user._id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions({ production, maxAgeMs }));
  }

  return {
    async register(req, res) {
      const user = await auth.register(registerBody.parse(req.body ?? {}));
      await startSession(res, user);
      res.status(201).json({ user: publicUser(user) });
    },
    async login(req, res) {
      const user = await auth.login(loginBody.parse(req.body ?? {}));
      await startSession(res, user);
      res.json({ user: publicUser(user) });
    },
    async logout(req, res) {
      await sessions.destroy(readCookie(req, SESSION_COOKIE));
      res.clearCookie(SESSION_COOKIE, sessionCookieOptions({ production }));
      res.status(204).end();
    },
    me(req, res) {
      res.json({ user: publicUser(req.user) });
    },
  };
}
