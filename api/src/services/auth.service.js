// Sign-up and sign-in (D10). Sessions and cookies are the controller's business;
// this decides who the user is.
import { HttpError } from "../utils/http-error.js";
import { isDuplicateKey } from "../utils/mongo.js";
import { hashPassword, verifyPassword, burnPasswordCheck, needsRehash } from "./password.service.js";
import { PHOTO_MAX_BYTES } from "./profile.service.js";

// users: the user model; sessions: the session service; profile: the profile service;
// fetchPicture(link, maxBytes) → Buffer | null: the Google client's photo download.
export function createAuthService({ users, sessions, profile, fetchPicture = async () => null, now = () => new Date() }) {
  // At the first Google sign-in, fill what the profile is missing from Google: the
  // name and the photo (copied, so it is served from our own site). Never overwrite
  // what the person set; a photo problem is skipped, never an error.
  async function fillFromGoogle(user, { name, picture }) {
    if (name && !user.profile?.name) await users.updateProfile(user._id, { name });
    if (!picture || user.photo || !profile) return;
    const data = await fetchPicture(picture, PHOTO_MAX_BYTES);
    if (!data) return;
    try {
      await profile.uploadFile(user._id, "photo", data);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error; // not a JPEG, PNG or WebP: no photo
    }
  }

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
    // No account, or a Google account with no password: spend the same time as a
    // real check, so response times do not reveal which emails exist (D22).
    const hash = user?.passwordHash;
    const ok = hash ? await verifyPassword(password, hash) : (await burnPasswordCheck(password), false);
    // One message for both cases, so the form does not reveal which emails exist.
    if (!ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    // A hash made with older, weaker parameters is replaced now, while the
    // password is in hand (D19).
    if (needsRehash(hash)) await users.setPasswordHash(user._id, await hashPassword(password));
    return user;
  }

  // A person Google has identified (sub = Google's account id, email verified by
  // Google) → { user, linked }. linked: a password account just became theirs.
  async function googleSignIn({ sub, email, name, picture }, retried = false) {
    try {
      // 1. Returning: recognised by the id, which never changes; the email follows
      //    Google's unless another account already has the new one.
      const known = await users.findByGoogleId(sub);
      if (known) {
        if (known.email !== email) {
          try {
            await users.setEmail(known._id, email);
            known.email = email;
          } catch (error) {
            if (!isDuplicateKey(error)) throw error;
          }
        }
        return { user: known, linked: false };
      }
      // 2. The email has an account: Google proved the email, so the account is
      //    theirs. Its password goes and every session on it ends (spec: no one who
      //    registered the address first keeps access).
      const existing = await users.findByEmail(email);
      if (existing) {
        await users.linkGoogle(existing._id, sub);
        await sessions.destroyAll(existing._id);
        await fillFromGoogle(existing, { name, picture });
        const { passwordHash, ...user } = existing;
        return { user: { ...user, googleId: sub }, linked: Boolean(passwordHash) };
      }
      // 3. New person.
      const user = await users.create({ email, googleId: sub, createdAt: now(), ...(name ? { profile: { name } } : {}) });
      await fillFromGoogle(user, { picture });
      return { user, linked: false };
    } catch (error) {
      // Two sign-ins racing (two tabs): the loser's insert or link hits a unique
      // index; one more pass finds what the winner wrote.
      if (isDuplicateKey(error) && !retried) return googleSignIn({ sub, email, name, picture }, true);
      throw error;
    }
  }

  return { register, login, googleSignIn };
}
