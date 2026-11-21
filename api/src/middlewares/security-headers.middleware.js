// Security headers on every API response (D19). The API only ever returns JSON and
// the user's own files, so it can be strict: nothing may load, frame or be cached.
// File downloads override Cache-Control and the CSP with their own, stricter ones.
export function securityHeaders({ production }) {
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Cache-Control", "no-store"); // responses carry private data
    if (production) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  };
}
