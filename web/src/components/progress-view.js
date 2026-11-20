"use client";

import { useEffect, useState } from "react";
import { post } from "@/lib/api";
import { Alert, Button, Card, Spinner } from "@/components/ui";
import { IconCheck } from "@/components/icons";

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
  const startedAt = [...kit.progress].reverse().find((p) => p.step === "resumed")?.at ?? kit.createdAt;
  const elapsed = useElapsed(startedAt, generating);
  const doneCount = STEPS.filter(({ step }) => ["done", "reused"].includes(states.get(step)?.status)).length;

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
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-ink">{generating ? "Building your kit" : "Progress"}</h2>
            {generating && <p className="text-xs text-muted">Usually 1–2 minutes. You can leave this page; it keeps going.</p>}
          </div>
          {generating && (
            <span className="rounded-full bg-accent-tint px-2.5 py-1 font-mono text-xs text-accent" aria-label={`Elapsed ${elapsed}`}>
              {elapsed}
            </span>
          )}
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
        </div>
        <p className="sr-only">
          {doneCount} of {STEPS.length} steps done
        </p>
        <ol className="relative mt-5 space-y-4 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-px before:bg-sunken" aria-live="polite">
          {STEPS.map(({ step, label, logs: prefixes }) => {
            const state = states.get(step);
            const status = state?.status ?? "pending";
            const lines = logs.filter((l) => prefixes.some((p) => l.message.startsWith(p)));
            return (
              <li key={step} className="relative flex gap-3">
                <StepIcon status={status} active={generating} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${status === "pending" ? "text-muted" : "text-ink"}`}>
                    {label}
                    {status === "reused" && <span className="ml-2 text-xs text-accent">reused from the earlier run</span>}
                    {status === "done" && state.ms != null && <span className="ml-2 text-xs text-muted">{(state.ms / 1000).toFixed(1)}s</span>}
                  </p>
                  {lines.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
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
      <aside className="space-y-6">
        <section>
          <h2 className="eyebrow">You asked for</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Company website</dt>
              <dd className="break-all text-ink">{kit.input?.company_url}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Days to prepare</dt>
              <dd className="text-ink">{kit.input?.days}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Job description</dt>
              <dd className="text-ink">{(kit.input?.jd?.length ?? 0).toLocaleString()} characters</dd>
            </div>
          </dl>
        </section>
        <p className="border-l-2 border-rule pl-3 text-xs leading-relaxed text-muted">
          Each step is saved as it finishes. If anything stops part-way, Resume carries on from the last finished step.
        </p>
      </aside>
    </div>
  );
}

function StepIcon({ status, active }) {
  if (status === "done" || status === "reused") {
    return (
      <span aria-label={status} className="relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] text-surface">
        <IconCheck className="h-3 w-3" />
      </span>
    );
  }
  if (status === "started" && active) {
    return (
      <span aria-label="in progress" className="relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface text-accent">
        <Spinner />
      </span>
    );
  }
  return <span aria-label="not started" className="relative mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-rule-strong bg-surface" />;
}

// "1:07" since the run started, ticking while it runs.
function useElapsed(since, running) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
