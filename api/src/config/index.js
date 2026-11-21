// Reads environment variables once. Every variable is documented in .env.example.
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  return {
    production,
    llm: {
      baseUrl: (env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
      apiKey: env.LLM_API_KEY || "",
      model: env.LLM_MODEL || "openai/gpt-oss-120b",
      fastModel: env.LLM_MODEL_FAST || env.LLM_MODEL || "openai/gpt-oss-20b",
    },
    tavilyApiKey: env.TAVILY_API_KEY || "",
    // Private/loopback fetches are allowed unless explicitly disabled; production
    // disables them by default (D6). The batch CLI must reach localhost sites.
    allowPrivateUrls: parseBoolean(env.ALLOW_PRIVATE_URLS, !production),
    // Needed by the server only; the batch CLI runs without a database.
    mongodbUri: env.MONGODB_URI || "",
    port: Number(env.PORT) || 4000,
    // How many proxies sit in front of the API, so req.ip is the real client (D19).
    // Behind Vercel's rewrite and Render's proxy that is 2; locally 1 is harmless.
    trustProxyHops: Number.isInteger(Number(env.TRUST_PROXY_HOPS)) && env.TRUST_PROXY_HOPS !== undefined && env.TRUST_PROXY_HOPS !== "" ? Number(env.TRUST_PROXY_HOPS) : 1,
  };
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes"].includes(String(value).toLowerCase());
}

// Refuse to start a production server that is misconfigured, instead of failing on
// the first real request (D19). → list of problems (empty when fine).
export function productionProblems(config) {
  if (!config.production) return [];
  const problems = [];
  if (!config.mongodbUri) problems.push("MONGODB_URI is not set");
  if (!config.llm.apiKey) problems.push("LLM_API_KEY is not set");
  if (config.allowPrivateUrls) problems.push("ALLOW_PRIVATE_URLS is on: the private-address guard would be off in production");
  if (!(config.trustProxyHops >= 0 && config.trustProxyHops <= 5)) problems.push("TRUST_PROXY_HOPS must be a whole number from 0 to 5");
  return problems;
}
