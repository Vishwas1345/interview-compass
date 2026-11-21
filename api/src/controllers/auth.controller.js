// Sign-up, sign-in (password or Google), sign-out, and who is signed in. Sessions
// become cookies here.
import { timingSafeEqual } from "node:crypto";
import { DEFAULT_NEXT, safeNext } from "@interview-compass/shared";
import { loginBody, registerBody } from "../validators/auth.validator.js";
import { publicUser } from "../views/user.view.js";
import { SESSION_COOKIE } from "../services/session.service.js";
import { readCookie, sessionCookieOptions, roundTripCookieOptions, ROUND_TRIP_MS } from "../utils/cookies.js";
import { HttpError } from "../utils/http-error.js";
import { GoogleSignInError } from "../lib/google.js";
import { randomToken, challengeFor } from "../utils/pkce.js";

const ROUND_TRIP_COOKIE = "ic_google";
// safeNext only needs an origin to resolve against; any fixed one keeps "on this site".
const SITE = "https://app.invalid";

// throttle: services/throttle.service.js (sign-in and sign-up limits, D19).
// google: lib/google.js client, or null when Google sign-in is not configured (D22).
export function createAuthController({ auth, sessions, throttle, google, production, now = () => new Date(), log = console.error }) {
  async function startSession(res, user) {
    const { token, maxAgeMs } = await sessions.create(user._id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions({ production, maxAgeMs }));
  }

  function requireGoogle() {
    if (!google) throw new HttpError(404, "NOT_FOUND", "No such endpoint.");
  }

  // The round trip's secrets, from the cookie set at the start. → object | null
  function readRoundTrip(req) {
    try {
      const trip = JSON.parse(Buffer.from(readCookie(req, ROUND_TRIP_COOKIE) ?? "", "base64url").toString("utf8"));
      const fields = ["state", "verifier", "nonce", "next"].every((key) => typeof trip?.[key] === "string" && trip[key]);
      return fields && Number.isFinite(trip.at) ? trip : null;
    } catch {
      return null;
    }
  }

  const sameToken = (a, b) => typeof a === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  return {
    async register(req, res) {
      const body = registerBody.parse(req.body ?? {});
      throttle.checkSignUp(req.ip);
      const user = await auth.register(body);
      await startSession(res, user);
      res.status(201).json({ user: publicUser(user) });
    },
    async login(req, res) {
      const body = loginBody.parse(req.body ?? {});
      throttle.checkLogin(req.ip, body.email);
      let user;
      try {
        user = await auth.login(body);
      } catch (error) {
        if (error.code === "INVALID_CREDENTIALS") throttle.loginFailed(req.ip, body.email);
        throw error;
      }
      throttle.loginSucceeded(body.email);
      await startSession(res, user);
      res.json({ user: publicUser(user) });
    },
    async logout(req, res) {
      await sessions.destroy(readCookie(req, SESSION_COOKIE));
      res.clearCookie(SESSION_COOKIE, sessionCookieOptions({ production }));
      res.status(204).end();
    },
    me(req, res) {
      res.json({ user: publicUser(req.user) });
    },

    // Which sign-in methods the pages should offer.
    options(_req, res) {
      res.json({ google: Boolean(google) });
    },

    // Step 1: send the browser to Google. state (stops a forged return), the PKCE
    // verifier (makes a stolen code useless) and nonce (ties the token to this
    // sign-in) stay in a 10-minute httpOnly cookie; Google sees only the challenge.
    googleStart(req, res) {
      requireGoogle();
      const trip = { state: randomToken(), verifier: randomToken(), nonce: randomToken(), next: safeNext(req.query.next, SITE), at: now().getTime() };
      res.cookie(ROUND_TRIP_COOKIE, Buffer.from(JSON.stringify(trip)).toString("base64url"), roundTripCookieOptions({ production, maxAgeMs: ROUND_TRIP_MS }));
      res.redirect(302, google.authUrl({ state: trip.state, nonce: trip.nonce, challenge: challengeFor(trip.verifier) }));
    },

    // Step 2: Google sends the browser back. Every outcome is a redirect to a page,
    // because the person arrives by navigation, not from our JavaScript.
    async googleCallback(req, res) {
      requireGoogle();
      const trip = readRoundTrip(req);
      res.clearCookie(ROUND_TRIP_COOKIE, roundTripCookieOptions({ production })); // single use, whatever happens
      const next = trip ? safeNext(trip.next, SITE) : DEFAULT_NEXT;
      const fail = (reason) => res.redirect(303, `/login?error=${reason}${next !== DEFAULT_NEXT ? `&next=${encodeURIComponent(next)}` : ""}`);

      const { code, state, error } = req.query;
      if (error) return fail(error === "access_denied" ? "google_cancelled" : "google_unavailable");
      const age = trip ? now().getTime() - trip.at : Infinity;
      if (!trip || typeof code !== "string" || !code || !sameToken(state, trip.state) || age < 0 || age > ROUND_TRIP_MS) return fail("google_expired");

      let identity;
      try {
        identity = await google.exchange(code, trip.verifier, trip.nonce);
      } catch (failure) {
        if (!(failure instanceof GoogleSignInError)) throw failure;
        if (failure.reason === "unverified") return fail("google_unverified");
        log(`google sign-in unavailable id=${req.id}: ${failure.message}`); // never the code or tokens
        return fail("google_unavailable");
      }
      const { user, linked } = await auth.googleSignIn(identity);
      await startSession(res, user);
      res.redirect(303, linked ? "/profile?notice=google-linked" : next);
    },
  };
}
