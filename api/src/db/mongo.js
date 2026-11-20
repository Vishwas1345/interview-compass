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

  const kits = db.collection("kits");
  await kits.createIndex({ userId: 1, createdAt: -1 }); // the kit list
  await kits.createIndex({ userId: 1, dedupeKey: 1 }); // "you already have a kit for this posting"
  // At most one generating kit per user, enforced by the database: two Generate
  // clicks racing each other cannot both insert (spec: one generation at a time).
  await kits.createIndex(
    { userId: 1 },
    { name: "one_generating_per_user", unique: true, partialFilterExpression: { status: "generating" } },
  );
}
