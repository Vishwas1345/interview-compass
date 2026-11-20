// A failure that ends a pipeline run. `code` is what the batch output and the
// API report; the message is plain words for a person.
export class PipelineError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, { cause });
    this.name = "PipelineError";
    this.code = code;
  }
}

export const ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  LLM_NOT_CONFIGURED: "LLM_NOT_CONFIGURED",
  LLM_UNAVAILABLE: "LLM_UNAVAILABLE",
  LLM_BAD_OUTPUT: "LLM_BAD_OUTPUT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};
