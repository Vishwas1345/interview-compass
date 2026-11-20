import express from "express";
import { errorHandler } from "./http/errors.js";
import { requireJson, requireUser } from "./http/middleware.js";
import { createSessionStore } from "./auth/sessions.js";
import { authRoutes } from "./routes/auth.js";
import { kitRoutes } from "./routes/kits.js";

// Builds the Express app without listening, so tests can mount it directly.
// Everything lives under /api: the web app proxies /api/* here, so the session
// cookie stays first-party (D10). Without a database only the health check runs.
// jobs: the kit generation runner (kits/jobs.js), built by the caller so the server
// and the tests choose the pipeline dependencies.
// coach: { llm, model } for the answer coach.
export function createApp({ db, jobs, coach, production = false, now = () => new Date(), log = console.error } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind Render's proxy and the web app's rewrite
  app.use(express.json({ limit: "200kb" }));

  const health = (_req, res) => res.json({ status: "ok" });
  app.get("/health", health);
  app.get("/api/health", health);

  if (db) {
    const sessions = createSessionStore({ db, now });
    app.use("/api", requireJson);
    app.use("/api/auth", authRoutes({ db, sessions, production, now }));
    app.use("/api/kits", requireUser({ sessions, users: db.collection("users"), production }), kitRoutes({ db, jobs, coach, now }));
  }

  app.use("/api", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "No such endpoint." } }));
  app.use(errorHandler(log));
  return app;
}
