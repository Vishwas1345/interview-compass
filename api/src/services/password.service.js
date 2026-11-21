// Password hashing with Node's built-in scrypt (D10, D19): a memory-hard hash with a
// per-user random salt, compared in constant time. No native dependency.
//
// Cost: N = 2^15, r = 8, p = 1 (32 MB per hash). OWASP's current recommendation is
// N = 2^17, which needs 128 MB per hash: too much for a 512 MB free instance with a
// few sign-ins at once. The stored hash records its parameters, so the cost can rise
// later and old hashes keep verifying; they are upgraded at the next sign-in.

import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

export const SCRYPT = { N: 2 ** 15, r: 8, p: 1 };
const LEGACY = { N: 2 ** 14, r: 8, p: 1 }; // Node's default, used by "scrypt$salt$hash"
const KEY_LENGTH = 64;

function derive(password, salt, keyLength, { N, r, p }) {
  // maxmem must exceed 128 * N * r bytes, or Node refuses the parameters.
  const maxmem = 256 * N * r;
  return new Promise((resolve, reject) => scrypt(password, salt, keyLength, { N, r, p, maxmem }, (e, key) => (e ? reject(e) : resolve(key))));
}

// → "scrypt$N=32768,r=8,p=1$<salt hex>$<hash hex>"
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

// Both formats: "scrypt$N=..,r=..,p=..$salt$hash" and the older "scrypt$salt$hash".
function parse(stored) {
  const parts = String(stored).split("$");
  if (parts[0] !== "scrypt") return null;
  if (parts.length === 3) return { params: LEGACY, saltHex: parts[1], hashHex: parts[2] };
  if (parts.length !== 4) return null;
  const params = Object.fromEntries(parts[1].split(",").map((kv) => kv.split("=")).map(([k, v]) => [k, Number(v)]));
  if (![params.N, params.r, params.p].every((n) => Number.isInteger(n) && n > 0)) return null;
  return { params: { N: params.N, r: params.r, p: params.p }, saltHex: parts[2], hashHex: parts[3] };
}

export async function verifyPassword(password, stored) {
  const parsed = parse(stored);
  if (!parsed?.saltHex || !parsed.hashHex) return false;
  const expected = Buffer.from(parsed.hashHex, "hex");
  const actual = await derive(password, Buffer.from(parsed.saltHex, "hex"), expected.length, parsed.params);
  return timingSafeEqual(actual, expected);
}

// True when a stored hash uses weaker parameters than SCRYPT (upgrade it at sign-in).
export function needsRehash(stored) {
  const parsed = parse(stored);
  return !parsed || parsed.params.N < SCRYPT.N || parsed.params.r < SCRYPT.r || parsed.params.p < SCRYPT.p;
}

// Hashing a password for an unknown email too keeps "no such user" and "wrong
// password" equally slow, so response time does not reveal which emails exist.
const DUMMY = await hashPassword("timing-equaliser");
export async function burnPasswordCheck(password) {
  await verifyPassword(password, DUMMY);
}
