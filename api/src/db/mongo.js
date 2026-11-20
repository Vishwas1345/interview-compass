// MongoDB access (D11): the official driver, one place that names the collections
// and creates their indexes. The database name comes from the connection string.

import { MongoClient } from "mongodb";

export async function connectDb(uri) {
  if (!uri) throw new Error("MONGODB_URI is not set; see .env.example.");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db();
  await ensureIndexes(db);
  return { client, db };
}

export async function ensureIndexes(db) {
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  // Expired sessions are removed by MongoDB itself; lookups also check expiresAt,
  // because the TTL monitor runs only about once a minute.
  await db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
