// An error with an HTTP status and a stable code, thrown anywhere in a request and
// turned into { error: { code, message, ...extra } } by middlewares/error-handler.js.
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
