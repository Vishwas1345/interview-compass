// Sign-up, sign-in, sign-out, and who is signed in. Sessions become cookies here.
import { loginBody, registerBody } from "../validators/auth.validator.js";
import { publicUser } from "../views/user.view.js";
import { SESSION_COOKIE } from "../services/session.service.js";
import { readCookie, sessionCookieOptions } from "../utils/cookies.js";

// throttle: services/throttle.service.js (sign-in and sign-up limits, D19).
export function createAuthController({ auth, sessions, throttle, production }) {
  async function startSession(res, user) {
    const { token, maxAgeMs } = await sessions.create(user._id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions({ production, maxAgeMs }));
  }

  return {
    async register(req, res) {
      const body = registerBody.parse(req.body ?? {});
      throttle.checkSignUp(req.ip);
      const user = await auth.register(body);
      await startSession(res, user);
      res.status(201).json({ user: publicUser(user) });
    },
    async login(req, res) {
      const body = loginBody.parse(req.body ?? {});
      throttle.checkLogin(req.ip, body.email);
      let user;
      try {
        user = await auth.login(body);
      } catch (error) {
        if (error.code === "INVALID_CREDENTIALS") throttle.loginFailed(req.ip, body.email);
        throw error;
      }
      throttle.loginSucceeded(body.email);
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
