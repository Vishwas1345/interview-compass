import { loadConfig } from "./config.js";
import { connectDb } from "./db/mongo.js";
import { createApp } from "./app.js";
import { createJobRunner } from "./kits/jobs.js";
import { createPipelineDeps } from "./pipeline/run-pipeline.js";

const config = loadConfig();

let db;
try {
  ({ db } = await connectDb(config.mongodbUri));
} catch (error) {
  console.error(`Could not connect to MongoDB: ${error.message}`);
  process.exit(1);
}

// One pipeline deps object for the whole process: the LLM client inside it holds
// the per-model rate budget every generation shares (D5).
const jobs = createJobRunner({ db, pipelineDeps: createPipelineDeps(config) });
const interrupted = await jobs.recoverOnBoot();
if (interrupted > 0) console.log(`marked ${interrupted} unfinished generation(s) as interrupted`);

createApp({ db, jobs, production: config.production }).listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
});
