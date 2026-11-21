// Users (D10, D16). The only code that queries the users collection. Every read
// except a file download leaves the stored file bytes out.

const WITHOUT_FILES = { "photo.data": 0, "resume.data": 0 };

export function createUserModel(db) {
  const users = db.collection("users");
  return {
    ensureIndexes: () => users.createIndex({ email: 1 }, { unique: true }),

    async create(user) {
      const { insertedId } = await users.insertOne(user);
      return { ...user, _id: insertedId };
    },
    findByEmail: (email) => users.findOne({ email }, { projection: WITHOUT_FILES }),
    findById: (id) => users.findOne({ _id: id }, { projection: WITHOUT_FILES }),
    async findPasswordHash(id) {
      return (await users.findOne({ _id: id }, { projection: { passwordHash: 1 } }))?.passwordHash ?? null;
    },

    async updateProfile(id, fields) {
      const $set = Object.fromEntries(Object.entries(fields).map(([key, value]) => [`profile.${key}`, value]));
      if (Object.keys($set).length > 0) await users.updateOne({ _id: id }, { $set });
    },
    setEmail: (id, email) => users.updateOne({ _id: id }, { $set: { email } }),
    setPasswordHash: (id, passwordHash) => users.updateOne({ _id: id }, { $set: { passwordHash } }),

    // field: "photo" | "resume"
    setFile: (id, field, file) => users.updateOne({ _id: id }, { $set: { [field]: file } }),
    async getFile(id, field) {
      return (await users.findOne({ _id: id }, { projection: { [field]: 1 } }))?.[field] ?? null;
    },
    removeFile: (id, field) => users.updateOne({ _id: id }, { $unset: { [field]: "" } }),

    // The daily kit cap counts creations, not kits that still exist (review C7):
    // deleting a kit must not give its place back. Only the latest 20 are kept.
    recordKitCreation: (id, at) => users.updateOne({ _id: id }, { $push: { kitCreations: { $each: [at], $slice: -20 } } }),
    async countKitCreationsSince(id, since) {
      const user = await users.findOne({ _id: id }, { projection: { kitCreations: 1 } });
      return (user?.kitCreations ?? []).filter((at) => at > since).length;
    },

    delete: (id) => users.deleteOne({ _id: id }),
  };
}
