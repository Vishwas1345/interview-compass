const STYLE = {
  generated: "bg-zinc-100 text-zinc-600",
  edited: "bg-sky-100 text-sky-800",
  pinned: "bg-amber-100 text-amber-900",
};
const TITLE = {
  generated: "Written by the AI and untouched: a regeneration may replace it.",
  edited: "Changed by you: a regeneration keeps it.",
  pinned: "Pinned by you: a regeneration keeps it exactly as it is.",
};

// The D8 label on every question, flashcard and brief field.
export function ItemState({ state = "generated", origin }) {
  const label = origin === "user" && state === "edited" ? "yours" : state;
  return (
    <span title={TITLE[state]} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${STYLE[state] ?? STYLE.generated}`}>
      {state === "pinned" && <span aria-hidden="true" className="mr-1">📌</span>}
      {label}
    </span>
  );
}
