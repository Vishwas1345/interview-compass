// Sign-in and sign-up throttling (D19). Only failures count for sign-in, so real
// users are never blocked by their own successful logins:
// - per email: 10 failures in 15 minutes protects one account, whatever the IP;
// - per IP: 50 failures in 15 minutes stops one address spraying many accounts;
// - sign-up: 10 accounts per IP per hour.
import { HttpError } from "../utils/http-error.js";
import { createWindowCounter } from "../utils/window-counter.js";

const MINUTE = 60 * 1000;

export function createAuthThrottle({ now = () => new Date() } = {}) {
  const failuresByEmail = createWindowCounter({ max: 10, windowMs: 15 * MINUTE, now });
  const failuresByIp = createWindowCounter({ max: 50, windowMs: 15 * MINUTE, now });
  const signUpsByIp = createWindowCounter({ max: 10, windowMs: 60 * MINUTE, now });

  const tooMany = (seconds, what) =>
    new HttpError(429, "TOO_MANY_ATTEMPTS", `Too many ${what}. Try again in ${Math.max(1, Math.ceil(seconds / 60))} minute(s).`, { retryAfterSeconds: seconds });

  return {
    checkLogin(ip, email) {
      const wait = Math.max(failuresByEmail.blockedFor(email), failuresByIp.blockedFor(ip));
      if (wait > 0) throw tooMany(wait, "sign-in attempts");
    },
    loginFailed(ip, email) {
      failuresByEmail.record(email);
      failuresByIp.record(ip);
    },
    loginSucceeded(email) {
      failuresByEmail.reset(email);
    },
    checkSignUp(ip) {
      const wait = signUpsByIp.blockedFor(ip);
      if (wait > 0) throw tooMany(wait, "sign-ups from this network");
      signUpsByIp.record(ip);
    },
  };
}
