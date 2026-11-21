// Random values for the Google sign-in round trip (D22): state, nonce and the PKCE
// verifier, plus the S256 challenge Google is sent in place of the verifier.
import { randomBytes, createHash } from "node:crypto";

export const randomToken = () => randomBytes(32).toString("base64url");
export const challengeFor = (verifier) => createHash("sha256").update(verifier).digest("base64url");
