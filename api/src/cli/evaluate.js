// Batch entry point (brief Section 9, Appendix B):
//   npm run evaluate -- --input <cases.json> --output <kits.json>
// Runs each case through the same pipeline the app uses, one after another (they
// share one model budget). A failing case is recorded and the next one starts.
// The output file is rewritten after every case, so an interrupted run still
// leaves every finished case on disk.

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadConfig } from "../config/index.js";
import { runPipeline, createPipelineDeps } from "../pipeline/run-pipeline.js";
import { ERROR_CODES } from "../pipeline/errors.js";

const { values } = parseArgs({ options: { input: { type: "string" }, output: { type: "string" } } });
if (!values.input || !values.output) {
  console.error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  process.exit(1);
}

let cases;
try {
  cases = JSON.parse(await readFile(values.input, "utf8"));
} catch (error) {
  console.error(`Could not read ${values.input}: ${error.message}`);
  process.exit(1);
}
if (!Array.isArray(cases)) {
  console.error("Input must be a JSON array of cases.");
  process.exit(1);
}

const deps = createPipelineDeps(loadConfig(), { log: (m) => console.error(`    llm: ${m}`) });
const result = { version: "1.0", generated_at: new Date().toISOString(), kits: [] };
const runStarted = Date.now();
await writeFile(values.output, JSON.stringify(result, null, 2) + "\n"); // an empty case list still gets a valid file

for (const [index, testCase] of cases.entries()) {
  const id = testCase?.id ?? `case-${index + 1}`;
  const started = Date.now();
  console.error(`[${index + 1}/${cases.length}] ${id}`);
  let entry;
  try {
    const { kit, usage } = await runPipeline(testCase, {
      ...deps,
      onProgress: (p) => {
        if (p.status === "done") console.error(`  ✓ ${p.step} (${seconds(p.ms)})`);
        else if (p.message) console.error(`      ${p.message}`);
      },
    });
    entry = { id, status: "ok", kit, error: null };
    const tokens = Object.entries(usage).map(([model, n]) => `${model} ${n}`).join(", ");
    console.error(`  ok in ${seconds(Date.now() - started)} — ${kit.questions.length} questions, ${tokens || "no"} tokens`);
  } catch (error) {
    const code = error.code && ERROR_CODES[error.code] ? error.code : ERROR_CODES.INTERNAL_ERROR;
    entry = { id, status: "failed", kit: null, error: { code, message: error.message } };
    console.error(`  FAILED in ${seconds(Date.now() - started)} — ${code}: ${error.message}`);
  }
  result.kits.push(entry);
  await writeFile(values.output, JSON.stringify(result, null, 2) + "\n");
}

const ok = result.kits.filter((k) => k.status === "ok").length;
console.error(`Done: ${ok}/${cases.length} ok in ${seconds(Date.now() - runStarted)}. Wrote ${values.output}`);

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}
