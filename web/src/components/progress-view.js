"use client";

import { useState } from "react";
import { post } from "@/lib/api";
import { Alert, Button, Card, Spinner } from "@/components/ui";

// The pipeline's steps in order (api/src/pipeline/run-pipeline.js), in plain words.
export const STEPS = [
  { step: "extract requirements", label: "Reading the job description", logs: ["extract:"] },
  { step: "research company site", label: "Researching the company website", logs: ["crawl:"] },
  { step: "search public discussion", label: "Searching for public interview discussion", logs: ["search:"] },
  { step: "write company brief", label: "Writing the company brief", logs: [] },
  { step: "read interview process", label: "Reading the interview process", logs: [] },
  { step: "generate questions", label: "Writing questions, one category at a time", logs: ["questions:"] },
  { step: "check coverage", label: "Checking every requirement has a question", logs: ["coverage:"] },
  { step: "make flashcards", label: "Making flashcards", logs: [] },
];

// Progress events are { step, status: started | done | reused | failed, ms, message }.
// Only events after the latest resume describe the current attempt.
function stepStates(progress) {
  const states = new Map();
  for (const event of progress) {
    if (event.step === "log") continue;
    if (["started", "done", "reused"].includes(event.status)) states.set(event.step, event);
  }
  return states;
}

export function ProgressView({ kit, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const states = stepStates(kit.progress);
  const logs = kit.progress.filter((p) => p.step === "log" && p.message);
  const generating = kit.status === "generating";

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      onChange((await post(`/kits/${kit.id}/resume`)).kit);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {kit.status === "failed" && (
        <Alert title="This kit could not be generated" action={<Button size="sm" busy={busy} onClick={resume}>Try again</Button>}>
          {kit.error?.message} <span className="text-xs opacity-75">({kit.error?.code})</span>
        </Alert>
      )}
      {kit.status === "interrupted" && (
        <Alert tone="warning" title="Generation was interrupted" action={<Button size="sm" busy={busy} onClick={resume}>Resume</Button>}>
          The server restarted part-way. Resume continues from the last finished step; nothing is fetched or paid for twice.
        </Alert>
      )}
      {error && <Alert className="mt-3">{error}</Alert>}
      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{generating ? "Building your kit" : "Progress"}</h2>
          {generating && <span className="text-xs text-zinc-500">Usually 1–2 minutes. You can leave this page.</span>}
        </div>
        <ol className="mt-4 space-y-3" aria-live="polite">
          {STEPS.map(({ step, label, logs: prefixes }) => {
            const state = states.get(step);
            const status = state?.status ?? "pending";
            const lines = logs.filter((l) => prefixes.some((p) => l.message.startsWith(p)));
            return (
              <li key={step} className="flex gap-3">
                <StepIcon status={status} active={generating} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${status === "pending" ? "text-zinc-500" : "text-zinc-900"}`}>
                    {label}
                    {status === "reused" && <span className="ml-2 text-xs text-indigo-700">reused from the earlier run</span>}
                    {status === "done" && state.ms != null && <span className="ml-2 text-xs text-zinc-500">{(state.ms / 1000).toFixed(1)}s</span>}
                  </p>
                  {lines.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                      {lines.slice(-6).map((l, i) => (
                        <li key={i} className="truncate">
                          {l.message.replace(/^\w+: /, "")}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

function StepIcon({ status, active }) {
  if (status === "done" || status === "reused") {
    return (
      <span aria-label={status} className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-[11px] text-white">
        ✓
      </span>
    );
  }
  if (status === "started" && active) {
    return (
      <span aria-label="in progress" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center text-indigo-600">
        <Spinner />
      </span>
    );
  }
  return <span aria-label="not started" className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-zinc-300" />;
}
