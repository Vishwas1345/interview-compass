// Where to go after signing in (?next=). Only a path on this site: the value is
// resolved against our own origin and refused if the origin changes. Backslashes and
// control characters are refused outright, because browsers read "/\evil.com" and
// "/<tab>/evil.com" as "//evil.com" (review S2).
export const DEFAULT_NEXT = "/kits";

export function safeNext(value, origin) {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return DEFAULT_NEXT;
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
}
