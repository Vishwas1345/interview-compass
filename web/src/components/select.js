"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconChevronDown } from "@/components/icons";

// Our own dropdown, in place of the operating system's menu (which ignores the
// design). WAI-ARIA listbox pattern: Enter/Space/↓ open; ↑ ↓ Home End move; Enter
// selects; Escape closes and returns focus; Tab or a click outside closes. Opens
// upward when there is no room below.
//
// options: [{ value, label, hint? }]; value null + placeholder makes it an action menu.
export function Select({ value, options, onChange, label, placeholder = "Select…", variant = "field", align = "left", renderValue, className = "" }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [upward, setUpward] = useState(false);
  const root = useRef(null);
  const button = useRef(null);
  const list = useRef(null);
  const id = useId();
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  function show() {
    const rect = button.current.getBoundingClientRect();
    setUpward(window.innerHeight - rect.bottom < Math.min(280, options.length * 36 + 16) && rect.top > window.innerHeight - rect.bottom);
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }
  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) button.current?.focus();
  }
  function choose(index) {
    const option = options[index];
    close();
    if (option && option.value !== value) onChange(option.value);
  }

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (e) => !root.current?.contains(e.target) && close(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function onButtonKey(e) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      show();
    }
  }
  function onListKey(e) {
    const last = options.length - 1;
    const moves = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  const trigger =
    variant === "compact"
      ? "inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted hover:bg-hover hover:text-ink"
      : variant === "menu"
        ? "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-ink-soft ring-1 ring-inset ring-rule-strong bg-surface hover:bg-hover hover:text-ink"
        : "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-rule-strong bg-surface px-3 text-sm text-ink hover:border-ink/30";

  return (
    <div ref={root} className={`relative ${variant === "field" ? "block" : "inline-block"} ${className}`}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={label ? `${label}: ${selected?.label ?? placeholder}` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKey}
        className={`transition-colors ${trigger} ${open ? "bg-hover text-ink" : ""}`}
      >
        <span className={`truncate ${selected ? "" : variant === "field" ? "text-faint" : ""}`}>{selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}</span>
        <IconChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
          className={`absolute z-40 max-h-72 min-w-[11rem] overflow-auto rounded-lg border border-rule bg-surface py-1 shadow-[0_16px_40px_-16px_rgb(28_27_25/0.35)] focus:outline-none ${
            upward ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } ${align === "right" ? "right-0" : "left-0"} ${variant === "field" ? "w-full" : ""}`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={String(option.value)}
                id={`${id}-opt-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm ${index === active ? "bg-hover text-ink" : "text-ink-soft"}`}
              >
                <span className="mt-0.5 w-3.5 shrink-0 text-accent">{isSelected && <IconCheck className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0">
                  <span className={`block ${isSelected ? "font-medium text-ink" : ""}`}>{option.label}</span>
                  {option.hint && <span className="block text-xs text-muted">{option.hint}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
