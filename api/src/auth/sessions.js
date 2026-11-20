// Server-side sessions (D10). The browser holds a random token in an httpOnly
// cookie; the database stores only the token's SHA-256, so reading the sessions
// collection does not give anyone a usable login.

import { randomBytes, createHash } from "node:crypto";

export const SESSION_COOKIE = "ic_session";
export const SESSION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MS = SESSION_DAYS * DAY_MS;
const RENEW_AFTER_MS = DAY_MS; // sliding expiry, renewed at most once a day

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

export function createSessionStore({ db, now = () => new Date() }) {
  const sessions = db.collection("sessions");

  async function create(userId) {
    const token = randomBytes(32).toString("base64url");
    const at = now();
    await sessions.insertOne({ _id: hashToken(token), userId, createdAt: at, expiresAt: new Date(at.getTime() + SESSION_MS) });
    return { token, maxAgeMs: SESSION_MS };
  }

  // → { session, renewed } | null (unknown or expired)
  async function lookup(token) {
    if (!token) return null;
    const session = await sessions.findOne({ _id: hashToken(token) });
    const at = now();
    if (!session || session.expiresAt <= at) return null;
    if (session.expiresAt.getTime() - at.getTime() < SESSION_MS - RENEW_AFTER_MS) {
      const expiresAt = new Date(at.getTime() + SESSION_MS);
      await sessions.updateOne({ _id: session._id }, { $set: { expiresAt } });
      return { session: { ...session, expiresAt }, renewed: true };
    }
    return { session, renewed: false };
  }

  async function destroy(token) {
    if (token) await sessions.deleteOne({ _id: hashToken(token) });
  }

  // After a password change: sign out every other device, keep this one.
  async function destroyOthers(userId, keepToken) {
    await sessions.deleteMany({ userId, _id: { $ne: hashToken(keepToken) } });
  }

  async function destroyAll(userId) {
    await sessions.deleteMany({ userId });
  }

  return { create, lookup, destroy, destroyOthers, destroyAll, maxAgeMs: SESSION_MS };
}
