import { loadConfig, productionProblems } from "./config/index.js";
import { connectDb } from "./config/database.js";
import { createApp } from "./app.js";
import { createJobRunner } from "./services/job.service.js";
import { createPipelineDeps } from "./pipeline/run-pipeline.js";

const config = loadConfig();
const problems = productionProblems(config);
if (problems.length > 0) {
  console.error(`Refusing to start in production:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

let db;
try {
  ({ db } = await connectDb(config.mongodbUri));
} catch (error) {
  console.error(`Could not connect to MongoDB: ${error.message}`);
  process.exit(1);
}

// One pipeline deps object for the whole process: the LLM client inside it holds
// the per-model rate budget every generation shares (D5).
const pipelineDeps = createPipelineDeps(config);
const jobs = createJobRunner({ db, pipelineDeps });
const interrupted = await jobs.recoverOnBoot();
if (interrupted > 0) console.log(`marked ${interrupted} unfinished generation(s) as interrupted`);

const coach = { llm: pipelineDeps.llm, model: pipelineDeps.models.fast };
createApp({ db, jobs, coach, production: config.production, trustProxyHops: config.trustProxyHops }).listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
});
