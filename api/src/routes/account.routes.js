// Account actions that need the current password (profile spec): change email,
// change password (signs out other devices), delete the account and everything in it.

import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../utils/http-error.js";
import { sessionCookieOptions } from "../utils/cookies.js";
import { hashPassword, verifyPassword } from "../services/password.service.js";
import { SESSION_COOKIE } from "../services/session.service.js";
import { publicUser } from "../views/user.view.js";
import { PASSWORD_MIN } from "./auth.routes.js";

const password = z.string().min(1, "Enter your current password.").max(200);
const emailBody = z.object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)), currentPassword: password });
const passwordBody = z.object({
  currentPassword: password,
  newPassword: z.string().min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`).max(200, "Password is too long."),
});
const deleteBody = z.object({ password });

export function accountRoutes({ db, sessions, production }) {
  const users = db.collection("users");
  const router = Router();

  async function checkPassword(req, candidate) {
    const user = await users.findOne({ _id: req.user._id }, { projection: { passwordHash: 1 } });
    if (!user || !(await verifyPassword(candidate, user.passwordHash))) {
      throw new HttpError(401, "WRONG_PASSWORD", "Your current password is incorrect.");
    }
  }

  router.post("/email", async (req, res) => {
    const { email, currentPassword } = emailBody.parse(req.body ?? {});
    await checkPassword(req, currentPassword);
    try {
      await users.updateOne({ _id: req.user._id }, { $set: { email } });
    } catch (error) {
      if (error?.code === 11000) throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
      throw error;
    }
    res.json({ user: publicUser({ ...req.user, email }) });
  });

  router.post("/password", async (req, res) => {
    const { currentPassword, newPassword } = passwordBody.parse(req.body ?? {});
    await checkPassword(req, currentPassword);
    await users.updateOne({ _id: req.user._id }, { $set: { passwordHash: await hashPassword(newPassword) } });
    await sessions.destroyOthers(req.user._id, req.sessionToken);
    res.status(204).end();
  });

  router.post("/delete", async (req, res) => {
    const { password: given } = deleteBody.parse(req.body ?? {});
    await checkPassword(req, given);
    await db.collection("kits").deleteMany({ userId: req.user._id });
    await sessions.destroyAll(req.user._id);
    await users.deleteOne({ _id: req.user._id });
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions({ production }));
    res.status(204).end();
  });

  return router;
}
