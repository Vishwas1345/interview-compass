import { IconPin } from "@/components/icons";

// The D8 label on every question, flashcard and brief field, set in small capitals.
const STYLE = {
  generated: { text: "text-faint", label: "AI" },
  edited: { text: "text-accent", label: "Edited" },
  pinned: { text: "text-accent", label: "Pinned" },
};
const TITLE = {
  generated: "Written by the AI and untouched: a regeneration may replace it.",
  edited: "Changed by you: a regeneration keeps it.",
  pinned: "Pinned by you: a regeneration keeps it exactly as it is.",
};

export function ItemState({ state = "generated", origin }) {
  const style = STYLE[state] ?? STYLE.generated;
  const label = origin === "user" && state === "edited" ? "Yours" : style.label;
  return (
    <span title={TITLE[state]} className={`inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${style.text}`}>
      {state === "pinned" && <IconPin className="h-3 w-3" />}
      {label}
    </span>
  );
}
