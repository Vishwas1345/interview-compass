// The last middleware: every error leaves as { error: { code, message } }, the
// same shape the batch output uses, plus optional extra fields (e.g. the existing
// kit for a duplicate).

import { z } from "zod";
import { HttpError } from "../utils/http-error.js";
import { PipelineError, ERROR_CODES } from "../pipeline/errors.js";

const PIPELINE_STATUS = {
  [ERROR_CODES.INVALID_INPUT]: 400,
  [ERROR_CODES.LLM_NOT_CONFIGURED]: 503,
  [ERROR_CODES.LLM_UNAVAILABLE]: 503,
  [ERROR_CODES.LLM_BAD_OUTPUT]: 502,
};

// Express error handler (four arguments, last in the chain).
export function errorHandler(log = console.error) {
  // eslint-disable-next-line no-unused-vars
  return (error, req, res, next) => {
    // Every error body carries the request id (D19), so a report can be traced.
    const send = (status, body) => res.status(status).json({ error: { ...body, requestId: req.id } });
    if (error instanceof HttpError) {
      if (error.extra?.retryAfterSeconds) res.setHeader("Retry-After", String(error.extra.retryAfterSeconds));
      return send(error.status, { code: error.code, message: error.message, ...error.extra });
    }
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      const where = first?.path.length ? `${first.path.join(".")}: ` : "";
      return send(400, { code: "VALIDATION", message: `${where}${first?.message ?? "invalid request"}` });
    }
    if (error instanceof PipelineError) {
      return send(PIPELINE_STATUS[error.code] ?? 500, { code: error.code, message: error.message });
    }
    if (error?.type === "entity.parse.failed") return send(400, { code: "VALIDATION", message: "The request body is not valid JSON." });
    if (error?.type === "entity.too.large") return send(413, { code: "TOO_LARGE", message: "The request body is too large." });
    log(`${req.method} ${req.path} failed id=${req.id}: ${error?.stack ?? error}`);
    return send(500, { code: "INTERNAL_ERROR", message: `Something went wrong on our side. Quote ${req.id} if you report it.` });
  };
}
