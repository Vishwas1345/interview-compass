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
          className={`pointer-events-auto flex max-w-lg items-center gap-3 rounded-md px-4 py-2 text-sm text-white shadow-lg ${t.tone === "error" ? "bg-red-700" : "bg-zinc-900"}`}
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="rounded px-2 py-0.5 font-semibold text-indigo-200 hover:bg-white/10"
              onClick={() => {
                t.action.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="rounded px-1 text-zinc-400 hover:text-white" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
