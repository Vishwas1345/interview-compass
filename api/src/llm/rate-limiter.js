// Client-side pacing for one model (D5). Groq's free tier limits each model to
// ~8,000 tokens and ~30 requests per minute; waiting *before* a call is cheaper
// than being told to slow down after it.
//
// Sliding 60-second window: each call reserves its estimated tokens; when the
// reply arrives the reservation is corrected to the real usage. A 429 blocks the
// model until the provider's retry-after has passed.

const WINDOW_MS = 60_000;

export function createRateLimiter({ tokensPerMinute = 8000, requestsPerMinute = 30, now = Date.now, sleep = defaultSleep } = {}) {
  let entries = []; // { at, tokens }
  let blockedUntil = 0;

  const prune = () => {
    const cutoff = now() - WINDOW_MS;
    entries = entries.filter((e) => e.at > cutoff);
  };

  // Resolves when the call may go ahead; returns a handle to record real usage.
  async function acquire(estimatedTokens) {
    while (true) {
      prune();
      const t = now();
      if (t < blockedUntil) {
        await sleep(blockedUntil - t);
        continue;
      }
      const used = entries.reduce((sum, e) => sum + e.tokens, 0);
      const fitsTokens = used + estimatedTokens <= tokensPerMinute || entries.length === 0;
      const fitsRequests = entries.length < requestsPerMinute;
      if (fitsTokens && fitsRequests) {
        const entry = { at: t, tokens: estimatedTokens };
        entries.push(entry);
        return {
          settle(actualTokens) {
            if (Number.isFinite(actualTokens)) entry.tokens = actualTokens;
          },
        };
      }
      // Wait until the oldest reservation leaves the window.
      await sleep(Math.max(1, entries[0].at + WINDOW_MS - t + 1));
    }
  }

  function block(ms) {
    blockedUntil = Math.max(blockedUntil, now() + ms);
  }

  return { acquire, block };
}

export function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
