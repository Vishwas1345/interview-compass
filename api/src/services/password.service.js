// Password hashing with Node's built-in scrypt (D10): a memory-hard hash with a
// per-user random salt, compared in constant time. No native dependency.

import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

// → "scrypt$<salt hex>$<hash hex>"
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// Hashing a password for an unknown email too keeps "no such user" and "wrong
// password" equally slow, so response time does not reveal which emails exist.
const DUMMY = await hashPassword("timing-equaliser");
export async function burnPasswordCheck(password) {
  await verifyPassword(password, DUMMY);
}
