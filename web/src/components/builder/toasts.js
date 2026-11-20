"use client";

import { useCallback, useRef, useState } from "react";

// Short messages at the bottom of the screen, announced to screen readers, with an
// optional action (Undo).
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (message, { tone = "info", action, ms = 5000 } = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, message, tone, action }]);
      if (ms) setTimeout(() => dismiss(id), ms);
      return id;
    },
    [dismiss],
  );
  return { toasts, show, dismiss };
}

export function Toasts({ toasts, dismiss }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex max-w-lg items-center gap-3 rounded-md px-4 py-2.5 text-sm text-paper shadow-[0_12px_32px_-12px_rgb(28_27_25/0.5)] ${t.tone === "error" ? "bg-danger" : "bg-ink"}`}
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="rounded px-2 py-0.5 font-semibold text-accent-tint hover:bg-surface/10"
              onClick={() => {
                t.action.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="rounded px-1 text-faint hover:text-paper" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
