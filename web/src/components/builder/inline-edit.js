"use client";

import { useEffect, useRef, useState } from "react";

// Click (or Enter) to edit in place. Enter or leaving the field saves; Shift+Enter
// adds a line; Escape cancels (app spec: The builder).
export function InlineEdit({ value, onSave, label, maxLength = 2000, placeholder = "Empty", className = "", textClassName = "", allowEmpty = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const area = useRef(null);

  useEffect(() => {
    if (!editing) return;
    const el = area.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = `${el.scrollHeight}px`;
  }, [editing]);

  function start() {
    setDraft(value);
    setEditing(true);
  }
  function finish(save) {
    setEditing(false);
    const next = draft.trim();
    if (save && next !== value.trim() && (next || allowEmpty)) onSave(next);
  }

  if (editing) {
    return (
      <textarea
        ref={area}
        aria-label={label}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => {
          setDraft(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            finish(true);
          }
        }}
        className={`block w-full resize-none rounded-md border border-accent bg-surface px-2 py-1 text-sm ring-2 ring-accent/15 focus:outline-none ${className}`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      title="Click to edit"
      aria-label={`${label}: ${value || placeholder}. Press Enter to edit.`}
      className={`block w-full cursor-text whitespace-pre-wrap rounded-md px-2 py-1 text-left ring-inset transition-colors hover:bg-surface hover:ring-1 hover:ring-rule-strong ${value ? "" : "italic text-faint"} ${textClassName} ${className}`}
    >
      {value || placeholder}
    </button>
  );
}
