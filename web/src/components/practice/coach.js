"use client";

import { useState } from "react";
import { post } from "@/lib/api";
import { Button } from "@/components/ui";

const ANSWER_MAX = 3000;

// The answer coach (D15): type an answer before revealing; get what it covered,
// what it missed and one thing to add. It never writes the answer for you.
export function Coach({ kitId, card }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);

  async function check(e) {
    e.preventDefault();
    if (!answer.trim()) return setError("Type an answer first.");
    setBusy(true);
    setError(null);
    try {
      setFeedback((await post(`/kits/${kitId}/coach`, { itemId: card.id, answer })).feedback);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="mt-3 -ml-2 text-accent" onClick={() => setOpen(true)}>
        ✎ Rehearse: type your answer and get feedback
      </Button>
    );
  }
  return (
    <form onSubmit={check} className="mt-4 rounded-md border border-accent/20 bg-accent-tint/40 p-3">
      <label htmlFor={`answer-${card.id}`} className="text-sm font-medium text-ink-soft">
        Your answer
      </label>
      <textarea
        id={`answer-${card.id}`}
        rows={5}
        maxLength={ANSWER_MAX}
        value={answer}
        autoFocus
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && check(e)}
        placeholder="Answer as you would out loud. The coach compares it with the outline."
        className="mt-1 block w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{answer.length}/{ANSWER_MAX} · Ctrl/⌘+Enter to check</span>
        <Button type="submit" size="sm" busy={busy}>
          Check my answer
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {feedback && (
        <div aria-live="polite" className="mt-3 space-y-2 text-sm">
          {feedback.covered.length > 0 && (
            <div>
              <p className="font-medium text-accent">You covered</p>
              <ul className="list-disc pl-5 text-ink-soft">
                {feedback.covered.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {feedback.missed.length > 0 && (
            <div>
              <p className="font-medium text-warn">You missed</p>
              <ul className="list-disc pl-5 text-ink-soft">
                {feedback.missed.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {feedback.improvement && (
            <p>
              <span className="font-medium text-accent">Next: </span>
              {feedback.improvement}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
