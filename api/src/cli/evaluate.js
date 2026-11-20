// Batch entry point (brief Section 9):
//   npm run evaluate -- --input <cases.json> --output <kits.json>
// Scaffold: reads and checks the arguments and the case file, and writes the
// Appendix B envelope. Each case is recorded as failed until the pipeline lands.

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
  },
});

if (!values.input || !values.output) {
  console.error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  process.exit(1);
}

const cases = JSON.parse(await readFile(values.input, "utf8"));
if (!Array.isArray(cases)) {
  console.error("Input must be a JSON array of cases.");
  process.exit(1);
}

const kits = cases.map((testCase) => ({
  id: testCase.id,
  status: "failed",
  kit: null,
  error: { code: "NOT_IMPLEMENTED", message: "Pipeline not built yet." },
}));

const result = { version: "1.0", generated_at: new Date().toISOString(), kits };
await writeFile(values.output, JSON.stringify(result, null, 2) + "\n");
console.log(`Wrote ${kits.length} case(s) to ${values.output}`);
