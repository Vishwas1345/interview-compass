import { Router } from "express";

// /api/kits — every route is signed in (mounted behind requireUser).
export function kitRoutes({ controller }) {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:id", controller.show);
  router.delete("/:id", controller.remove);
  router.post("/:id/resume", controller.resume);
  router.post("/:id/ops", controller.applyOperation);
  router.post("/:id/regenerate", controller.regenerate);
  router.post("/:id/practice", controller.practice);
  router.post("/:id/coach", controller.coach);
  return router;
}
