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
  };
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes"].includes(String(value).toLowerCase());
}
