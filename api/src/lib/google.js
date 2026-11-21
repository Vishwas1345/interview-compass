// Google sign-in (OpenID Connect authorization code flow with PKCE, D22). The only
// code that talks to Google. The ID token comes straight from Google's token endpoint
// over TLS, authenticated with our client secret, so its claims are checked but its
// signature is not (OpenID Connect Core 3.1.3.7).

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
export const SCOPES = "openid email profile"; // identity only: no mail, contacts or files
const NAME_MAX = 80; // the profile's name limit

// reason: "unverified" (Google has not verified the email) | "unavailable" (anything else).
export class GoogleSignInError extends Error {
  constructor(reason, detail) {
    super(detail);
    this.name = "GoogleSignInError";
    this.reason = reason;
  }
}
const unavailable = (detail) => new GoogleSignInError("unavailable", detail);

export function createGoogleClient({ clientId, clientSecret, redirectUri, fetch = globalThis.fetch, now = () => new Date(), timeoutMs = 10_000 }) {
  // Where to send the browser. prompt=select_account lets people pick which account.
  function authUrl({ state, nonce, challenge }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return `${AUTH_URL}?${params}`;
  }

  // The one-time code → the person's Google identity. No retry: the code is single-use
  // at Google, and the person can simply click again.
  async function exchange(code, verifier, nonce) {
    let response;
    try {
      response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw unavailable(`token endpoint unreachable (${error.name})`);
    }
    if (!response.ok) throw unavailable(`token endpoint returned ${response.status}`);
    let body;
    try {
      body = await response.json();
    } catch {
      throw unavailable("token endpoint returned something other than JSON");
    }
    return checkClaims(decodeIdToken(body?.id_token), { clientId, nonce, now: now() });
  }

  return { authUrl, exchange };
}

// The claims (middle part) of a JWT. → object; throws when it is not a JWT.
export function decodeIdToken(token) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3) throw unavailable("no ID token in the response");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw unavailable("ID token claims are not JSON");
  }
}

// Every claim that makes the token ours, current and about a verified email.
// → { sub, email, name }
export function checkClaims(claims, { clientId, nonce, now }) {
  if (!claims || typeof claims !== "object") throw unavailable("ID token has no claims");
  if (!ISSUERS.has(claims.iss)) throw unavailable("ID token issuer is not Google");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientId)) throw unavailable("ID token is for another app");
  if (audiences.length > 1 && claims.azp !== clientId) throw unavailable("ID token was issued to another app");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) throw unavailable("ID token has expired");
  if (!nonce || claims.nonce !== nonce) throw unavailable("ID token nonce does not match this sign-in");
  if (typeof claims.sub !== "string" || !claims.sub) throw unavailable("ID token has no subject");
  if (typeof claims.email !== "string" || !claims.email.includes("@")) throw unavailable("ID token has no email");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new GoogleSignInError("unverified", "Google has not verified this email");
  const name = typeof claims.name === "string" ? claims.name.trim().slice(0, NAME_MAX) : "";
  return { sub: claims.sub, email: claims.email.trim().toLowerCase(), name };
}
