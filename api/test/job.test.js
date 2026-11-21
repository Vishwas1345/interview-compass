// Review C2 (2026-11-20): jobs run without being awaited, so any rejection inside
// them was unhandled and Node would exit, losing every generation in flight.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJobRunner } from "../src/services/job.service.js";
import { testPipelineDeps, fakeLlm } from "./helpers/fake-llm.js";

const down = async () => {
  throw new Error("Mongo failover");
};

function runner(kits) {
  const logged = [];
  const jobs = createJobRunner({ kits, pipelineDeps: testPipelineDeps(fakeLlm()), log: (m) => logged.push(String(m)) });
  return { jobs, logged };
}

test("a database failure before the job starts is logged, not thrown", async () => {
  const { jobs, logged } = runner({ findById: down });
  await jobs.start("kit-1"); // would reject (an unhandled rejection in production) before the fix
  assert.ok(logged.some((m) => /kit-1.*Mongo failover/s.test(m)));
});

test("a database failure while recording a failed generation is logged, not thrown", async () => {
  // The pipeline fails (no posting), then writing "failed" also fails.
  const { jobs, logged } = runner({ findById: async () => ({ status: "generating", input: { jd: "", company_url: "x", days: 1 } }), pushProgress: async () => {}, markFailed: down });
  await jobs.start("kit-2");
  assert.ok(logged.some((m) => /kit-2.*Mongo failover/s.test(m)));
});

test("a database failure during a regeneration is logged, not thrown", async () => {
  const { jobs, logged } = runner({ findById: down, failRegeneration: down });
  await jobs.regenerate("kit-3", { target: "brief" });
  assert.ok(logged.some((m) => /kit-3.*Mongo failover/s.test(m)));
});
