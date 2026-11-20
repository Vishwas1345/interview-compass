// Reading one cookie without a parser dependency, and the session cookie's
// attributes (D10).

export function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sessionCookieOptions({ production, maxAgeMs }) {
  return { httpOnly: true, sameSite: "lax", secure: production, path: "/", ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) };
}
