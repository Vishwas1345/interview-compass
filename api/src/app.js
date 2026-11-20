import express from "express";

// Builds the Express app without listening, so tests can mount it directly.
export function createApp() {
  const app = express();
  app.use(express.json({ limit: "200kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
