// Sign-up and sign-in (D10). Sessions and cookies are the controller's business;
// this decides who the user is.
import { HttpError } from "../utils/http-error.js";
import { isDuplicateKey } from "../utils/mongo.js";
import { hashPassword, verifyPassword, burnPasswordCheck, needsRehash } from "./password.service.js";

// users: the user model.
export function createAuthService({ users, now = () => new Date() }) {
  async function register({ email, password }) {
    try {
      return await users.create({ email, passwordHash: await hashPassword(password), createdAt: now() });
    } catch (error) {
      if (isDuplicateKey(error)) throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
      throw error;
    }
  }

  async function login({ email, password }) {
    const user = await users.findByEmail(email);
    const ok = user ? await verifyPassword(password, user.passwordHash) : (await burnPasswordCheck(password), false);
    // One message for both cases, so the form does not reveal which emails exist.
    if (!ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    // A hash made with older, weaker parameters is replaced now, while the
    // password is in hand (D19).
    if (needsRehash(user.passwordHash)) await users.setPasswordHash(user._id, await hashPassword(password));
    return user;
  }

  return { register, login };
}
