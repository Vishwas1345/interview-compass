// Account actions that need the current password (profile spec): change email,
// change password (signs out other devices), delete the account and everything in it.
// A Google account has no password (D22): its email and password belong to Google, and
// deleting it is confirmed by typing the account's email.
import { HttpError } from "../utils/http-error.js";
import { isDuplicateKey } from "../utils/mongo.js";
import { hashPassword, verifyPassword } from "./password.service.js";

// users, kits: models; sessions: the session service.
export function createAccountService({ users, kits, sessions }) {
  const googleAccount = (what) => new HttpError(409, "GOOGLE_ACCOUNT", `This account signs in with Google, so its ${what} is managed by Google.`);

  async function checkPassword(userId, candidate, what) {
    const hash = await users.findPasswordHash(userId);
    if (!hash) throw googleAccount(what);
    if (!(await verifyPassword(candidate, hash))) throw new HttpError(401, "WRONG_PASSWORD", "Your current password is incorrect.");
  }

  async function changeEmail(user, { email, currentPassword }) {
    await checkPassword(user._id, currentPassword, "email");
    try {
      await users.setEmail(user._id, email);
    } catch (error) {
      if (isDuplicateKey(error)) throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
      throw error;
    }
    return { ...user, email };
  }

  async function changePassword(user, sessionToken, { currentPassword, newPassword }) {
    await checkPassword(user._id, currentPassword, "password");
    await users.setPasswordHash(user._id, await hashPassword(newPassword));
    await sessions.destroyOthers(user._id, sessionToken);
  }

  async function deleteAccount(user, { password, confirmEmail }) {
    if (await users.findPasswordHash(user._id)) {
      if (!password) throw new HttpError(400, "VALIDATION", "Enter your current password.");
      await checkPassword(user._id, password);
    } else if (String(confirmEmail ?? "").trim().toLowerCase() !== user.email) {
      throw new HttpError(400, "CONFIRM_EMAIL", "Type your account's email exactly to confirm.");
    }
    await kits.deleteAllForUser(user._id);
    await sessions.destroyAll(user._id);
    await users.delete(user._id);
  }

  return { changeEmail, changePassword, deleteAccount };
}
