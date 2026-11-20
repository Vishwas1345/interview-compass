import { Router } from "express";

// /api/auth — register, login and logout are open; /me needs a session.
export function authRoutes({ controller, requireUser }) {
  const router = Router();
  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/logout", controller.logout);
  router.get("/me", requireUser, controller.me);
  return router;
}
