import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

test("GET /health returns ok", async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://localhost:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    server.close();
  }
});

test("a misconfigured production server refuses to start", async () => {
  const { loadConfig, productionProblems } = await import("../src/config/index.js");
  const bad = productionProblems(loadConfig({ NODE_ENV: "production", ALLOW_PRIVATE_URLS: "true" }));
  assert.equal(bad.length, 3, bad.join(" | ")); // no database, no model key, guard switched off
  const good = productionProblems(loadConfig({ NODE_ENV: "production", MONGODB_URI: "mongodb://x", LLM_API_KEY: "k", TRUST_PROXY_HOPS: "2" }));
  assert.deepEqual(good, []);
  assert.deepEqual(productionProblems(loadConfig({})), [], "development is not checked");
});
