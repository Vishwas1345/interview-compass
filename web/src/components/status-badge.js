// Status as a dot and a word: quiet enough to sit beside a serif title.
const STYLE = {
  generating: { dot: "bg-accent animate-pulse", text: "text-accent", label: "Generating" },
  ready: { dot: "bg-accent", text: "text-ink-soft", label: "Ready" },
  failed: { dot: "bg-danger", text: "text-danger", label: "Failed" },
  interrupted: { dot: "bg-warn", text: "text-warn", label: "Interrupted" },
};

export function StatusBadge({ status }) {
  const s = STYLE[status] ?? { dot: "bg-faint", text: "text-muted", label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
