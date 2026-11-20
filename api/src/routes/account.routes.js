import { Router } from "express";

// /api/account — signed in; each action also needs the current password.
export function accountRoutes({ controller }) {
  const router = Router();
  router.post("/email", controller.changeEmail);
  router.post("/password", controller.changePassword);
  router.post("/delete", controller.deleteAccount);
  return router;
}
