"use client";

import { useState } from "react";
import { Alert, Button, Card } from "@/components/ui";
import { CATEGORY_LABELS } from "@/components/builder/questions-tab";

export function ScheduleTab({ ctx, initialDays }) {
  const { kit, doc, act, show } = ctx;
  const [days, setDays] = useState(initialDays ?? String(kit.schedule.days_available));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const byId = new Map(kit.questions.map((q) => [q.id, q]));
  const totalMinutes = kit.schedule.days.reduce((sum, d) => sum + d.minutes, 0);

  async function rebuild(e) {
    e?.preventDefault();
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) return setError("Days must be a whole number from 1 to 365.");
    setError(null);
    setBusy(true);
    const changing = n !== kit.schedule.days_available;
    const saved = await act(changing ? { type: "setDays", days: n } : { type: "rebuildSchedule" });
    setBusy(false);
    if (saved) show(changing ? `Schedule rebuilt for ${n} day${n === 1 ? "" : "s"}.` : "Schedule rebuilt from your current questions.");
  }

  return (
    <div>
      {doc.scheduleStale && (
        <Alert tone="info" className="mb-4" action={<Button size="sm" busy={busy} onClick={rebuild}>Rebuild schedule</Button>}>
          Your questions changed since this schedule was built. Deleted questions are already gone from it; new ones are added when you rebuild.
        </Alert>
      )}
      <Card className="p-4">
        <form onSubmit={rebuild} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="days" className="block text-sm font-medium text-ink-soft">
              Days to prepare
            </label>
            <input id="days" type="number" min={1} max={365} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} aria-invalid={error ? true : undefined}
              className="mt-1 w-28 rounded-md border border-rule-strong bg-surface px-3 py-2 text-sm" />
          </div>
          <Button type="submit" busy={busy}>
            {Number(days) !== kit.schedule.days_available ? "Change days" : "Rebuild schedule"}
          </Button>
          <p className="text-xs text-muted">
            Built in code, no AI: must-haves and harder questions first; with 3+ days the last day is review. Times are estimates (10 / 15 / 20 minutes by difficulty, plus 10 minutes of review).
          </p>
        </form>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {initialDays && Number(initialDays) !== kit.schedule.days_available && (
          <p className="mt-2 text-sm text-accent">You came here to change this kit to {initialDays} days. Press “Change days”.</p>
        )}
      </Card>
      <p className="mt-4 text-sm text-muted">
        {kit.schedule.days.length} day{kit.schedule.days.length === 1 ? "" : "s"} · about {Math.round(totalMinutes / 60)} hours in total
      </p>
      <ol className="mt-2 space-y-2">
        {kit.schedule.days.map((d) => (
          <li key={d.day}>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg text-ink">Day {d.day}</h3>
                {d.kind === "review" && <span className="rounded bg-sunken px-1.5 py-0.5 text-xs font-medium text-ink-soft">Review</span>}
                <span className="text-sm text-muted">{d.minutes} min</span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{d.focus}</p>
              {d.question_ids.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {d.question_ids.map((id) => {
                    const q = byId.get(id);
                    return q ? (
                      <li key={id} className="truncate text-ink-soft">
                        <span className="text-muted">{CATEGORY_LABELS[q.category]} · </span>
                        {q.prompt}
                      </li>
                    ) : null;
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm italic text-muted">No questions this day.</p>
              )}
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
