// LLM client for any OpenAI-compatible chat endpoint (D5). One call = one JSON
// answer, validated against a zod schema.
//
// - Paced per model by a rate limiter (tokens + requests per minute).
// - Transient failures (429, 5xx, network, timeout) retried up to MAX_ATTEMPTS:
//   wait as long as `retry-after` says, else exponential backoff with jitter.
// - Invalid JSON or a schema mismatch gets one repair attempt with the errors.
// No SDK: plain fetch keeps the rate-limit headers and errors in our hands.

import { createRateLimiter, defaultSleep } from "./rate-limiter.js";
import { PipelineError, ERROR_CODES } from "../pipeline/errors.js";

export const MAX_ATTEMPTS = 5;
export const BASE_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 30_000;
export const REQUEST_TIMEOUT_MS = 60_000;

export function createLlmClient({
  baseUrl,
  apiKey,
  fetch = globalThis.fetch,
  sleep = defaultSleep,
  now = Date.now,
  random = Math.random,
  limits = {},
  log = () => {},
}) {
  const limiters = new Map();
  const limiterFor = (model) => {
    if (!limiters.has(model)) limiters.set(model, createRateLimiter({ ...limits, now, sleep }));
    return limiters.get(model);
  };

  // Returns { data, usage: { prompt_tokens, completion_tokens, total_tokens } }.
  async function chatJson({ model, system, user, schema, maxTokens = 2000, reasoningEffort = "low", label = "llm" }) {
    if (!apiKey) {
      throw new PipelineError(ERROR_CODES.LLM_NOT_CONFIGURED, "LLM_API_KEY is not set; see .env.example.");
    }

    const messages = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    for (let repair = 0; repair <= 1; repair += 1) {
      const reply = await send({ model, messages, maxTokens, reasoningEffort, label });
      addUsage(usage, reply.usage);

      const problem = check(reply.content, schema);
      if (!problem.error) return { data: problem.data, usage };

      log(`${label}: invalid output (${problem.error}), ${repair === 0 ? "asking for a repair" : "giving up"}`);
      messages.push({ role: "assistant", content: reply.content });
      messages.push({
        role: "user",
        content: `Your reply was not valid: ${problem.error}. Reply again with only the corrected JSON object, nothing else.`,
      });
    }
    throw new PipelineError(ERROR_CODES.LLM_BAD_OUTPUT, `${label}: the model returned invalid output twice.`);
  }

  async function send({ model, messages, maxTokens, reasoningEffort, label }) {
    const limiter = limiterFor(model);
    const estimate = Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4) + maxTokens;
    const body = JSON.stringify({
      model,
      messages,
      max_completion_tokens: maxTokens,
      reasoning_effort: reasoningEffort,
      response_format: { type: "json_object" },
    });

    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const slot = await limiter.acquire(estimate);
      let response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        slot.settle(0);
        lastError = `network error: ${error.message}`;
        await backoff(attempt, null, label, lastError);
        continue;
      }

      if (response.ok) {
        const payload = await response.json();
        slot.settle(payload.usage?.total_tokens);
        return { content: payload.choices?.[0]?.message?.content ?? "", usage: payload.usage };
      }

      const text = await response.text();
      // Groq's JSON mode rejects malformed model output itself with a 400. That is
      // bad output, not a bad request: hand the failed text to the repair path.
      // The slot keeps its estimate, since the failed generation still used tokens.
      const failedGeneration = response.status === 400 ? jsonValidateFailure(text) : null;
      if (failedGeneration !== null) return { content: failedGeneration, usage: undefined };

      slot.settle(0);
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      const detail = text.slice(0, 300);
      lastError = `HTTP ${response.status}: ${detail}`;

      if (response.status === 429) {
        if (retryAfterMs) limiter.block(retryAfterMs);
        await backoff(attempt, retryAfterMs, label, lastError);
        continue;
      }
      if (response.status >= 500) {
        await backoff(attempt, retryAfterMs, label, lastError);
        continue;
      }
      // Other 4xx (bad request, auth, request too large): retrying will not help.
      throw new PipelineError(ERROR_CODES.LLM_UNAVAILABLE, `${label}: ${lastError}`);
    }
    throw new PipelineError(ERROR_CODES.LLM_UNAVAILABLE, `${label}: gave up after ${MAX_ATTEMPTS} attempts (${lastError}).`);
  }

  async function backoff(attempt, retryAfterMs, label, reason) {
    if (attempt === MAX_ATTEMPTS) return;
    const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1));
    const wait = retryAfterMs ?? Math.round(exponential * (0.5 + random() * 0.5));
    log(`${label}: ${reason.slice(0, 80)} — retry ${attempt}/${MAX_ATTEMPTS - 1} in ${(wait / 1000).toFixed(1)}s`);
    await sleep(wait);
  }

  return { chatJson };
}

// The failed text from a json_validate_failed 400, or null for any other 400.
function jsonValidateFailure(text) {
  try {
    const error = JSON.parse(text).error;
    return error?.code === "json_validate_failed" ? String(error.failed_generation ?? "") : null;
  } catch {
    return null;
  }
}

function check(content, schema) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { error: "the reply is not valid JSON" };
  }
  const result = schema.safeParse(parsed);
  if (result.success) return { data: result.data };
  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { error: `it does not match the required shape (${issues})` };
}

function addUsage(total, usage = {}) {
  for (const key of Object.keys(total)) total[key] += usage[key] ?? 0;
}

// retry-after is seconds (or an HTTP date); returns milliseconds or null.
export function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1000));
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
