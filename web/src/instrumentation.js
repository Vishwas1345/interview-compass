// Runs once when the web server starts (Next.js instrumentation). On free hosting both
// services sleep when idle (D21, L11); without this, the API only starts waking after
// the first page has loaded in a browser, so a cold visit waits for two wake-ups in a
// row. Nudging the API here starts its wake-up at the same time as ours.
// Not awaited: register() must finish before the server takes requests, and a nudge
// must never delay or fail the start-up.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const apiOrigin = (process.env.API_ORIGIN || "http://localhost:4000").replace(/\/+$/, "");
  fetch(`${apiOrigin}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(90_000) }).catch(() => {});
}
