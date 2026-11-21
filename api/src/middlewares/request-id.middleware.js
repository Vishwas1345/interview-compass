import { randomUUID } from "node:crypto";

// Every request gets an id (D19): a safe incoming X-Request-Id is kept (so a proxy's
// trace id carries through), anything else is replaced. It goes back in the response
// header, on the access log line, and into every error body, so "it failed" from a
// user can be matched to the exact server log line.
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(req, res, next) {
  const incoming = req.headers["x-request-id"];
  req.id = typeof incoming === "string" && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}

// One line per request once it finishes: method, path (no query string), status,
// time, request id, and a short user id prefix. Never bodies, cookies or tokens.
export function accessLog(log) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const user = req.user ? ` user=${String(req.user._id).slice(-6)}` : "";
      log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms id=${req.id}${user}`);
    });
    next();
  };
}
