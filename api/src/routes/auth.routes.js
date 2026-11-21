import { Router } from "express";

// /api/auth — register, login, logout and Google sign-in are open; /me needs a session.
export function authRoutes({ controller, requireUser }) {
  const router = Router();
  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/logout", controller.logout);
  router.get("/me", requireUser, controller.me);
  router.get("/options", controller.options);
  router.get("/google/start", controller.googleStart);
  router.get("/google/callback", controller.googleCallback);
  return router;
}
