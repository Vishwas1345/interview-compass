const STYLES = {
  generating: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  ready: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  failed: "bg-red-50 text-red-800 ring-red-200",
  interrupted: "bg-amber-50 text-amber-900 ring-amber-200",
};
const LABELS = { generating: "Generating", ready: "Ready", failed: "Failed", interrupted: "Interrupted" };

export function StatusBadge({ status }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status] ?? ""}`}>{LABELS[status] ?? status}</span>;
}
