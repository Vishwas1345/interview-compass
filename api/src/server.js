import { loadConfig } from "./config.js";
import { connectDb } from "./db/mongo.js";
import { createApp } from "./app.js";

const config = loadConfig();

let db;
try {
  ({ db } = await connectDb(config.mongodbUri));
} catch (error) {
  console.error(`Could not connect to MongoDB: ${error.message}`);
  process.exit(1);
}

createApp({ db, production: config.production }).listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
});
