"use client";

// Small reusable building blocks (brief: reusable components). Plain Tailwind, no
// component library: each piece is a few lines and states its accessibility.

import { forwardRef, useEffect, useId, useRef } from "react";
import Link from "next/link";

const BUTTON = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
  secondary: "bg-white text-zinc-800 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 disabled:text-zinc-400",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  ghost: "text-zinc-700 hover:bg-zinc-100 disabled:text-zinc-400",
};
const SIZE = { sm: "px-2.5 py-1.5 text-sm", md: "px-4 py-2 text-sm" };

export function buttonClass(variant = "primary", size = "md", extra = "") {
  return `inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${BUTTON[variant]} ${SIZE[size]} ${extra}`;
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
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const Control = multiline ? "textarea" : "input";
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-800">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-zinc-500">
          {hint}
        </p>
      )}
      <Control
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none ${
          error ? "border-red-500" : "border-zinc-300"
        }`}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

const ALERT = {
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-indigo-200 bg-indigo-50 text-indigo-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

export function Alert({ tone = "error", title, children, action, className = "" }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${ALERT[tone]} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {title && <p className="font-medium">{title}</p>}
          {children && <div className={title ? "mt-1" : ""}>{children}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
      <p className="font-medium text-zinc-900">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-zinc-600">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-zinc-200 ${className}`} />;
}

export function Card({ className = "", children, ...props }) {
  return (
    <div className={`rounded-lg border border-zinc-200 bg-white ${className}`} {...props}>
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
      className="m-auto w-[min(92vw,28rem)] rounded-lg p-0 shadow-xl"
    >
      {open && (
        <div className="p-5">
          <h2 id={titleId} className="text-base font-semibold text-zinc-900">
            {title}
          </h2>
          <div className="mt-2 text-sm text-zinc-700">{children}</div>
          {actions && <div className="mt-5 flex flex-wrap justify-end gap-2">{actions}</div>}
        </div>
      )}
    </dialog>
  );
}
