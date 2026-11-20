// Every API error leaves as { error: { code, message } }, the same shape the batch
// output uses, plus optional extra fields (e.g. the existing kit for a duplicate).

import { z } from "zod";
import { PipelineError, ERROR_CODES } from "../pipeline/errors.js";

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

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
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message, ...error.extra } });
    }
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      const where = first?.path.length ? `${first.path.join(".")}: ` : "";
      return res.status(400).json({ error: { code: "VALIDATION", message: `${where}${first?.message ?? "invalid request"}` } });
    }
    if (error instanceof PipelineError) {
      return res.status(PIPELINE_STATUS[error.code] ?? 500).json({ error: { code: error.code, message: error.message } });
    }
    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({ error: { code: "VALIDATION", message: "The request body is not valid JSON." } });
    }
    if (error?.type === "entity.too.large") {
      return res.status(413).json({ error: { code: "TOO_LARGE", message: "The request body is too large." } });
    }
    log(`${req.method} ${req.path} failed: ${error?.stack ?? error}`);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side." } });
  };
}
