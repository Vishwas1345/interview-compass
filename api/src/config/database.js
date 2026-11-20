// MongoDB connection (D11): the official driver. Collections, queries and indexes
// live in models/; the database name comes from the connection string.

import { MongoClient } from "mongodb";
import { createModels } from "../models/index.js";

export async function connectDb(uri) {
  if (!uri) throw new Error("MONGODB_URI is not set; see .env.example.");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db();
  await ensureIndexes(db);
  return { client, db };
}

// Each model declares its own indexes; this runs them all at startup.
export async function ensureIndexes(db) {
  const models = createModels(db);
  for (const model of Object.values(models)) await model.ensureIndexes();
}
