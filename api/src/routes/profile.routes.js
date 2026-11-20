import { Router } from "express";
import { requireUploadHeader } from "../middlewares/upload.middleware.js";
import { rawBody } from "../middlewares/raw-body.middleware.js";
import { FILE_RULES } from "../services/profile.service.js";

// /api/profile — signed in. Uploads are raw bodies behind the upload guard (D16).
export function profileRoutes({ controller }) {
  const router = Router();
  router.get("/", controller.show);
  router.patch("/", controller.update);
  for (const field of ["photo", "resume"]) {
    const { maxBytes, tooBig } = FILE_RULES[field];
    router.put(`/${field}`, requireUploadHeader, rawBody(maxBytes, tooBig), controller.upload(field));
    router.get(`/${field}`, controller.download(field));
    router.delete(`/${field}`, controller.remove(field));
  }
  return router;
}
