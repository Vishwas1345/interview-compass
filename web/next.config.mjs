// The browser only ever talks to this app; /api/* is proxied to the Express API,
// so the session cookie is first-party (D10). API_ORIGIN is read at build time.
const API_ORIGIN = (process.env.API_ORIGIN || "http://localhost:4000").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
// Security headers for every page (D19). The CSP is partial on purpose: Next.js
// injects inline scripts, so a script-src policy would need per-request nonces. These
// directives block framing, plugins, <base> hijacking and off-site form posts without
// touching scripts. (A full script policy is recorded in docs/GAPS.md.)
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
  transpilePackages: ["@interview-compass/shared"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
