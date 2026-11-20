// Register, login, logout, me (spec: Accounts). No email verification or password
// reset (out of scope per the brief).

import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../utils/http-error.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { readCookie, sessionCookieOptions } from "../utils/cookies.js";
import { hashPassword, verifyPassword, burnPasswordCheck } from "../services/password.service.js";
import { SESSION_COOKIE } from "../services/session.service.js";
import { publicUser } from "../views/user.view.js";

export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200; // scrypt cost grows with input; a cap stops oversized inputs

const credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)),
  password: z.string().max(PASSWORD_MAX, "Password is too long."),
});
const registration = credentials.extend({
  password: z.string().min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`).max(PASSWORD_MAX, "Password is too long."),
});


export function authRoutes({ db, sessions, production, now = () => new Date() }) {
  const users = db.collection("users");
  const router = Router();

  async function startSession(res, user) {
    const { token, maxAgeMs } = await sessions.create(user._id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions({ production, maxAgeMs }));
  }

  router.post("/register", async (req, res) => {
    const { email, password } = registration.parse(req.body ?? {});
    const user = { email, passwordHash: await hashPassword(password), createdAt: now() };
    try {
      const { insertedId } = await users.insertOne(user);
      user._id = insertedId;
    } catch (error) {
      if (error?.code === 11000) throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
      throw error;
    }
    await startSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post("/login", async (req, res) => {
    const { email, password } = credentials.parse(req.body ?? {});
    const user = await users.findOne({ email });
    const ok = user ? await verifyPassword(password, user.passwordHash) : (await burnPasswordCheck(password), false);
    // One message for both cases, so the form does not reveal which emails exist.
    if (!ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    await startSession(res, user);
    res.json({ user: publicUser(user) });
  });

  router.post("/logout", async (req, res) => {
    await sessions.destroy(readCookie(req, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions({ production }));
    res.status(204).end();
  });

  router.get("/me", requireUser({ sessions, users, production }), (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  return router;
}
