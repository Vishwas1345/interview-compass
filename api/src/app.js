import express from "express";
import { errorHandler } from "./middlewares/error-handler.js";
import { requireUser } from "./middlewares/auth.middleware.js";
import { requireJson } from "./middlewares/json.middleware.js";
import { createModels } from "./models/index.js";
import { createSessionService } from "./services/session.service.js";
import { createAuthService } from "./services/auth.service.js";
import { createAccountService } from "./services/account.service.js";
import { createProfileService } from "./services/profile.service.js";
import { createKitService } from "./services/kit.service.js";
import { createAuthController } from "./controllers/auth.controller.js";
import { createAccountController } from "./controllers/account.controller.js";
import { createProfileController } from "./controllers/profile.controller.js";
import { createKitController } from "./controllers/kit.controller.js";
import { authRoutes } from "./routes/auth.routes.js";
import { kitRoutes } from "./routes/kit.routes.js";
import { profileRoutes } from "./routes/profile.routes.js";
import { accountRoutes } from "./routes/account.routes.js";

// The composition root: models → services → controllers → routes, assembled once.
// Everything lives under /api: the web app proxies /api/* here, so the session
// cookie stays first-party (D10). Without a database only the health check runs.
//
// jobs: the generation runner (services/job.service.js), built by the caller so the
// server and the tests choose the pipeline dependencies; coach: { llm, model }.
export function createApp({ db, jobs, coach, production = false, now = () => new Date(), log = console.error } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind Render's proxy and the web app's rewrite
  app.use(express.json({ limit: "200kb" }));

  const health = (_req, res) => res.json({ status: "ok" });
  app.get("/health", health);
  app.get("/api/health", health);

  if (db) {
    const models = createModels(db);
    const sessions = createSessionService({ sessions: models.sessions, now });
    const services = {
      auth: createAuthService({ users: models.users, now }),
      account: createAccountService({ users: models.users, kits: models.kits, sessions }),
      profile: createProfileService({ users: models.users, now }),
      kits: createKitService({ kits: models.kits, jobs, coach, now }),
    };
    const signedIn = requireUser({ sessions, users: models.users, production });

    app.use("/api", requireJson);
    app.use("/api/auth", authRoutes({ controller: createAuthController({ auth: services.auth, sessions, production }), requireUser: signedIn }));
    app.use("/api/kits", signedIn, kitRoutes({ controller: createKitController({ kits: services.kits }) }));
    app.use("/api/profile", signedIn, profileRoutes({ controller: createProfileController({ profile: services.profile }) }));
    app.use("/api/account", signedIn, accountRoutes({ controller: createAccountController({ account: services.account, production }) }));
  }

  app.use("/api", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "No such endpoint." } }));
  app.use(errorHandler(log));
  return app;
}
