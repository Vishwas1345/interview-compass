// Sessions (D10). Stored by the SHA-256 of the cookie token; expired ones are
// removed by MongoDB's TTL monitor.

export function createSessionModel(db) {
  const sessions = db.collection("sessions");
  return {
    async ensureIndexes() {
      await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await sessions.createIndex({ userId: 1 }); // sign out other devices
    },
    insert: (session) => sessions.insertOne(session),
    findById: (id) => sessions.findOne({ _id: id }),
    setExpiry: (id, expiresAt) => sessions.updateOne({ _id: id }, { $set: { expiresAt } }),
    deleteById: (id) => sessions.deleteOne({ _id: id }),
    deleteOthers: (userId, keepId) => sessions.deleteMany({ userId, _id: { $ne: keepId } }),
    deleteAllForUser: (userId) => sessions.deleteMany({ userId }),
  };
}
