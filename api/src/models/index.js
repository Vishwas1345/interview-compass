import { createUserModel } from "./user.model.js";
import { createSessionModel } from "./session.model.js";
import { createKitModel } from "./kit.model.js";

export function createModels(db) {
  return { users: createUserModel(db), sessions: createSessionModel(db), kits: createKitModel(db) };
}
