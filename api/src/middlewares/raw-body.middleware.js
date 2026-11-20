import express from "express";
import { HttpError } from "../utils/http-error.js";

// A raw request body (file uploads, D16) with a per-route size cap and a friendly
// message when it is exceeded.
export function rawBody(limit, tooBigMessage) {
  const parse = express.raw({ type: () => true, limit });
  return (req, res, next) =>
    parse(req, res, (error) => {
      if (error?.type === "entity.too.large") return next(new HttpError(413, "TOO_LARGE", tooBigMessage));
      next(error);
    });
}
