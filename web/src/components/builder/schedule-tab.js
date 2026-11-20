"use client";

import { useState } from "react";
import { Alert, Button } from "@/components/ui";
import { CATEGORY_LABELS } from "@/components/builder/questions-tab";

export function ScheduleTab({ ctx, initialDays }) {
  const { kit, doc, act, show } = ctx;
  const [days, setDays] = useState(initialDays ?? String(kit.schedule.days_available));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const byId = new Map(kit.questions.map((q) => [q.id, q]));
  const totalMinutes = kit.schedule.days.reduce((sum, d) => sum + d.minutes, 0);
  const maxMinutes = Math.max(1, ...kit.schedule.days.map((d) => d.minutes));
  const changing = Number(days) !== kit.schedule.days_available;

  async function rebuild(e) {
    e?.preventDefault();
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) return setError("Days must be a whole number from 1 to 365.");
    setError(null);
    setBusy(true);
    const saved = await act(n !== kit.schedule.days_available ? { type: "setDays", days: n } : { type: "rebuildSchedule" });
    setBusy(false);
    if (saved) show(n !== kit.schedule.days_available ? `Schedule rebuilt for ${n} day${n === 1 ? "" : "s"}.` : "Schedule rebuilt from your current questions.");
  }

  return (
    <div>
      {doc.scheduleStale && (
        <Alert tone="info" className="mb-6" action={<Button size="sm" busy={busy} onClick={rebuild}>Rebuild schedule</Button>}>
          Your questions changed since this schedule was built. Deleted questions are already gone from it; new ones join when you rebuild.
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
        <div>
          <p className="font-display text-[44px] leading-none text-ink">
            {kit.schedule.days.length}
            <span className="ml-2 font-sans text-base text-muted">day{kit.schedule.days.length === 1 ? "" : "s"}</span>
          </p>
          <p className="mt-2 text-sm text-ink-soft">About {Math.max(1, Math.round(totalMinutes / 60))} hours in total, harder and must-have material first.</p>
        </div>
        <form onSubmit={rebuild} className="flex items-end gap-2">
          <div>
            <label htmlFor="days" className="eyebrow block">
              Days to prepare
            </label>
            <input
              id="days"
              type="number"
              min={1}
              max={365}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              aria-invalid={error ? true : undefined}
              className="mt-1.5 h-9 w-24 rounded-md border border-rule-strong bg-surface px-3 text-sm text-ink hover:border-ink/30 focus:border-ink/60 focus:outline-none"
            />
          </div>
          <Button type="submit" busy={busy} variant={changing ? "primary" : "secondary"}>
            {changing ? "Change days" : "Rebuild"}
          </Button>
        </form>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {initialDays && Number(initialDays) !== kit.schedule.days_available && (
        <p className="mt-3 text-sm text-accent">You came here to change this kit to {initialDays} days. Press “Change days”.</p>
      )}

      {/* Minutes per day at a glance. */}
      <div className="mt-6" aria-hidden="true">
        <div className="flex h-16 items-end gap-[3px]">
          {kit.schedule.days.map((d) => (
            <span
              key={d.day}
              title={`Day ${d.day}: ${d.minutes} min`}
              className={`min-w-[3px] flex-1 rounded-t-sm ${d.kind === "review" ? "bg-rule-strong" : "bg-accent/70"}`}
              style={{ height: `${Math.max(8, (d.minutes / maxMinutes) * 100)}%` }}
            />
          ))}
        </div>
        <p className="mt-2 flex gap-4 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-accent/70" /> Study
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-rule-strong" /> Review
          </span>
          <span className="ml-auto">Built in code, no AI · 10 / 15 / 20 min by difficulty, plus 10 min of review</span>
        </p>
      </div>

      <ol className="mt-8 border-t border-rule">
        {kit.schedule.days.map((d) => (
          <li key={d.day} className="grid gap-4 border-b border-rule py-6 sm:grid-cols-[7.5rem_1fr]">
            <div>
              <p className="eyebrow">{d.kind === "review" ? "Review" : "Day"}</p>
              <p className={`font-display text-[38px] leading-none ${d.kind === "review" ? "text-muted" : "text-ink"}`}>{d.day}</p>
              <p className="mt-1.5 text-xs text-muted">{d.minutes} min</p>
            </div>
            <div className="min-w-0">
              <p className="text-[15px] leading-snug text-ink">{d.focus.replace(/^Review: /, "")}</p>
              {d.question_ids.length > 0 ? (
                <ol className="mt-3 space-y-2">
                  {d.question_ids.map((id, i) => {
                    const q = byId.get(id);
                    return q ? (
                      <li key={id} className="flex gap-3 text-sm leading-snug">
                        <span className="mt-px w-5 shrink-0 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                        <span className="min-w-0">
                          <span className="text-ink-soft">{q.prompt}</span>
                          <span className="eyebrow ml-2 whitespace-nowrap">{CATEGORY_LABELS[q.category]}</span>
                        </span>
                      </li>
                    ) : null;
                  })}
                </ol>
              ) : (
                <p className="mt-3 text-sm italic text-muted">No questions this day.</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
