// Account actions that need the current password (profile spec): change email,
// change password (signs out other devices), delete the account and everything in it.
import { HttpError } from "../utils/http-error.js";
import { isDuplicateKey } from "../utils/mongo.js";
import { hashPassword, verifyPassword } from "./password.service.js";

// users, kits: models; sessions: the session service.
export function createAccountService({ users, kits, sessions }) {
  async function checkPassword(userId, candidate) {
    const hash = await users.findPasswordHash(userId);
    if (!hash || !(await verifyPassword(candidate, hash))) throw new HttpError(401, "WRONG_PASSWORD", "Your current password is incorrect.");
  }

  async function changeEmail(user, { email, currentPassword }) {
    await checkPassword(user._id, currentPassword);
    try {
      await users.setEmail(user._id, email);
    } catch (error) {
      if (isDuplicateKey(error)) throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
      throw error;
    }
    return { ...user, email };
  }

  async function changePassword(user, sessionToken, { currentPassword, newPassword }) {
    await checkPassword(user._id, currentPassword);
    await users.setPasswordHash(user._id, await hashPassword(newPassword));
    await sessions.destroyOthers(user._id, sessionToken);
  }

  async function deleteAccount(user, { password }) {
    await checkPassword(user._id, password);
    await kits.deleteAllForUser(user._id);
    await sessions.destroyAll(user._id);
    await users.delete(user._id);
  }

  return { changeEmail, changePassword, deleteAccount };
}
