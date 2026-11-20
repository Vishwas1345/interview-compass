// The one way the web app talks to the API. Same-origin /api/* (proxied, D10), JSON
// both ways, and every error turned into an ApiError carrying the server's code.

export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details; // extra fields, e.g. { existing, sameDays } for DUPLICATE
  }
}

// Called when the session is missing or ended; the SessionProvider registers it.
let onUnauthenticated = () => {};
export function setUnauthenticatedHandler(handler) {
  onUnauthenticated = handler;
}

export async function api(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK", "We could not reach the server. Check your connection and try again.");
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // The proxy answered with HTML (e.g. the API is still waking up).
  }
  if (response.ok) return data;

  const { code = "HTTP_ERROR", message, ...details } = data?.error ?? {};
  const error = new ApiError(
    response.status,
    code,
    message ?? (response.status >= 500 ? "The server is having trouble. Try again in a moment." : "Something went wrong."),
    details,
  );
  if (response.status === 401 && !path.startsWith("/auth/")) onUnauthenticated(error);
  throw error;
}

export const get = (path, options) => api(path, options);
export const post = (path, body = {}, options) => api(path, { ...options, method: "POST", body });
export const del = (path) => api(path, { method: "DELETE" });
