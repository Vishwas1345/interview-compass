"use client";

// Small reusable building blocks (brief: reusable components). Plain Tailwind, no
// component library: each piece is a few lines and states its accessibility.

import { forwardRef, useEffect, useId, useRef } from "react";
import Link from "next/link";

const BUTTON = {
  primary: "bg-accent text-surface hover:bg-accent-hover disabled:bg-accent/40",
  secondary: "bg-surface text-ink ring-1 ring-inset ring-rule-strong hover:ring-ink/40 disabled:text-faint",
  danger: "bg-danger text-surface hover:bg-danger-hover disabled:bg-danger/40",
  ghost: "text-ink-soft hover:bg-sunken hover:text-ink disabled:text-faint",
};
const SIZE = { sm: "h-8 px-3 text-[13px]", md: "h-9 px-4 text-sm" };

export function buttonClass(variant = "primary", size = "md", extra = "") {
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed ${BUTTON[variant]} ${SIZE[size]} ${extra}`;
}

export const Button = forwardRef(function Button({ variant = "primary", size = "md", busy = false, className = "", children, disabled, ...props }, ref) {
  return (
    <button ref={ref} type="button" className={buttonClass(variant, size, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...props}>
      {busy && <Spinner />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = "primary", size = "md", className = "", children, ...props }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

export function Spinner({ className = "h-4 w-4" }) {
  return <span aria-hidden="true" className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

// A labelled input or textarea with hint and error wired to aria-describedby.
export function Field({ label, hint, error, multiline = false, className = "", ...props }) {
  const id = useId();
  const describedBy = (error ? `${id}-error` : hint ? `${id}-hint` : "") || undefined;
  const Control = multiline ? "textarea" : "input";
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      <Control
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`mt-1.5 block w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors focus:border-ink/60 focus:outline-none ${
          error ? "border-danger" : "border-rule-strong hover:border-ink/30"
        }`}
        {...props}
      />
      {/* Hint and error sit below the input, so inputs in a row always line up. */}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

const ALERT = {
  error: { rule: "border-l-danger", title: "text-danger" },
  warning: { rule: "border-l-warn", title: "text-warn" },
  info: { rule: "border-l-accent", title: "text-ink" },
  success: { rule: "border-l-accent", title: "text-accent" },
};

// A quiet notice: a coloured left rule on the surface, not a coloured box.
export function Alert({ tone = "error", title, children, action, className = "" }) {
  const style = ALERT[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border border-l-[3px] border-rule bg-surface px-4 py-3 text-sm text-ink-soft ${style.rule} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {title && <p className={`font-medium ${style.title}`}>{title}</p>}
          {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-lg border border-dashed border-rule-strong px-6 py-12 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-sunken ${className}`} />;
}

export function Card({ className = "", children, ...props }) {
  return (
    <div className={`rounded-lg border border-rule bg-surface ${className}`} {...props}>
      {children}
    </div>
  );
}

// Native <dialog>: focus is trapped and Escape closes it, for free.
export function Dialog({ open, onClose, title, children, actions }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(92vw,28rem)] rounded-lg border border-rule bg-surface p-0 shadow-[0_24px_64px_-16px_rgb(28_27_25/0.35)]"
    >
      {open && (
        <div className="p-6">
          <h2 id={titleId} className="font-display text-xl text-ink">
            {title}
          </h2>
          <div className="mt-2 text-sm leading-relaxed text-ink-soft">{children}</div>
          {actions && <div className="mt-6 flex flex-wrap justify-end gap-2">{actions}</div>}
        </div>
      )}
    </dialog>
  );
}

// A square icon button; `label` is both its accessible name and its tooltip.
export function IconButton({ label, children, className = "", pressed, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`grid h-8 w-8 place-items-center rounded-md text-faint transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 ${pressed ? "text-accent" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
