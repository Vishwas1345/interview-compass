// The browser only ever talks to this app; /api/* is proxied to the Express API,
// so the session cookie is first-party (D10). API_ORIGIN is read at build time.
const API_ORIGIN = (process.env.API_ORIGIN || "http://localhost:4000").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
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
