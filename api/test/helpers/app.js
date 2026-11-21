// Test helpers: a real, throwaway MongoDB (mongodb-memory-server, D11) and an HTTP
// client that keeps cookies like a browser does.

import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { ensureIndexes } from "../../src/config/database.js";
import { createApp } from "../../src/app.js";

export async function startTestDb() {
  const server = await MongoMemoryServer.create();
  // monitorCommands lets a test see exactly what was sent to MongoDB.
  const client = await MongoClient.connect(server.getUri(), { monitorCommands: true });
  const db = client.db("test");
  await ensureIndexes(db);
  return {
    db,
    client,
    async stop() {
      await client.close();
      await server.stop();
    },
  };
}

// A clock tests can move forward.
export function testClock(start = "2026-11-21T10:00:00Z") {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), advance: (ms) => (t += ms) };
}

export async function startTestApp(options) {
  const server = createApp({ log: () => {}, ...options }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, origin: `http://localhost:${server.address().port}`, close: () => server.close() };
}

// Each client has its own cookie jar and its own client IP (X-Forwarded-For, which
// the app trusts for one proxy hop), like a separate person's browser. Per-request
// headers can still override the IP (the throttling tests do).
let browsers = 0;
export function browser(origin) {
  const jar = new Map();
  const n = ++browsers;
  const clientIp = `10.200.${(n >> 8) & 255}.${n & 255}`;
  async function request(method, path, body, { headers = {} } = {}) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        "X-Forwarded-For": clientIp,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const [name, value] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
      const expired = attributes.some((a) => /expires=thu, 01 jan 1970/i.test(a) || /max-age=0\b/i.test(a.trim()));
      if (expired || value === "") jar.delete(name);
      else jar.set(name, value);
    }
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  }
  return {
    jar,
    get: (path) => request("GET", path),
    post: (path, body = {}, options) => request("POST", path, body, options),
    del: (path) => request("DELETE", path),
    raw: request,
  };
}
