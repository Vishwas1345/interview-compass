"use client";

import { useState } from "react";
import { CONFIDENCE, CONFIDENCE_LABELS } from "@interview-compass/shared";
import { moveInList } from "@/lib/local-ops";
import { Button, ButtonLink, EmptyState, Field, IconButton } from "@/components/ui";
import { IconArrowDown, IconArrowUp, IconPin, IconPlay, IconPlus, IconTrash } from "@/components/icons";
import { InlineEdit } from "@/components/builder/inline-edit";
import { ItemState } from "@/components/builder/item-state";
import { RequirementPicker } from "@/components/builder/questions-tab";

// Flashcards as a glossary: the cue on the left in serif, the answer on the right.
export function FlashcardsTab({ ctx }) {
  const { kit, doc, act, deleteLater, pendingDeletes, show } = ctx;
  const cards = kit.flashcards.filter((f) => !pendingDeletes.has(f.id));
  const practice = doc.practice ?? {};
  const gotIt = cards.filter((f) => practice[f.id]?.confidence === CONFIDENCE.GOT_IT).length;
  const [adding, setAdding] = useState(false);
  const move = (id, delta) => {
    const order = moveInList(kit.flashcards.map((f) => f.id), id, delta);
    if (order) act({ type: "reorder", kind: "flashcards", ids: order });
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
        <div>
          <p className="font-display text-[44px] leading-none text-ink">
            {cards.length}
            <span className="ml-2 font-sans text-base text-muted">card{cards.length === 1 ? "" : "s"}</span>
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            {gotIt > 0 ? `${gotIt} marked “Got it” in practice.` : "Short cues for quick recall. Click any side to edit it."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <IconPlus /> Add a card
          </Button>
          {cards.length > 0 && (
            <ButtonLink href={`/kits/${doc.id}/practice`} size="sm">
              <IconPlay /> Practise these
            </ButtonLink>
          )}
        </div>
      </div>

      {adding && <AddCard ctx={ctx} onDone={(added) => (setAdding(false), added && show("Flashcard added. It is yours: regeneration keeps it."))} />}

      {cards.length === 0 && !adding ? (
        <div className="mt-8">
          <EmptyState title="No flashcards yet" action={<Button onClick={() => setAdding(true)}>Add a card</Button>}>
            Add a card for anything you want to recall quickly: a definition, a number, a trade-off.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 hidden grid-cols-[2.5rem_minmax(0,0.9fr)_minmax(0,1.1fr)_auto] gap-x-6 sm:grid">
            <span />
            <span className="eyebrow">Front</span>
            <span className="eyebrow">Back</span>
            <span />
          </div>
          <ol className="mt-2 border-t border-rule">
            {cards.map((f, index) => {
              const pinned = f.state === "pinned";
              const last = practice[f.id];
              return (
                <li key={f.id} className="group -mx-3 border-b border-rule px-3 py-5 transition-colors hover:bg-hover/50 focus-within:bg-hover/50">
                  {/* items-baseline: the number, the serif front and the back share a first baseline. */}
                  <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-6 gap-y-3 sm:grid-cols-[2.5rem_minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                    <span className="font-mono text-xs tabular-nums text-faint">{String(index + 1).padStart(2, "0")}</span>
                    <InlineEdit
                      label="Front"
                      value={f.front}
                      maxLength={500}
                      onSave={(front) => act({ type: "updateFlashcard", id: f.id, fields: { front } })}
                      className="-mx-2"
                      textClassName="font-display text-[19px] leading-snug text-ink"
                    />
                    <InlineEdit
                      label="Back"
                      value={f.back}
                      maxLength={500}
                      onSave={(back) => act({ type: "updateFlashcard", id: f.id, fields: { back } })}
                      className="col-start-2 -mx-2 sm:col-start-3"
                      textClassName="text-sm leading-relaxed text-ink-soft"
                    />
                    <div className="col-start-2 flex gap-0.5 self-start transition-opacity sm:col-start-4 sm:-mt-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <IconButton label={`Move card ${index + 1} up`} disabled={index === 0} onClick={() => move(f.id, -1)}>
                        <IconArrowUp />
                      </IconButton>
                      <IconButton label={`Move card ${index + 1} down`} disabled={index === cards.length - 1} onClick={() => move(f.id, 1)}>
                        <IconArrowDown />
                      </IconButton>
                      <IconButton label={pinned ? "Unpin" : "Pin: keep exactly as it is"} pressed={pinned} onClick={() => act({ type: "setPinned", target: "flashcard", id: f.id, pinned: !pinned })}>
                        <IconPin />
                      </IconButton>
                      <IconButton label={`Delete card ${index + 1}`} className="hover:bg-danger-tint hover:text-danger" onClick={() => deleteLater("flashcard", f.id, `card ${index + 1}`)}>
                        <IconTrash />
                      </IconButton>
                    </div>
                    {/* col-[2/-1]: a col-span-* class would reset the start column to 1. */}
                    <div className="col-[2/-1] flex flex-wrap items-baseline gap-x-2 gap-y-1 px-0 text-xs text-muted">
                      <ItemState state={f.state} origin={f.origin} />
                      {f.requirement_ids
                        .map((id) => kit.role.requirements.find((x) => x.id === id))
                        .filter(Boolean)
                        .map((r) => (
                          <span key={r.id} className={`before:mr-2 before:text-rule-strong before:content-['·'] ${r.priority === "must" ? "text-ink-soft" : "text-faint"}`}>
                            {r.text}
                          </span>
                        ))}
                      {last && (
                        <span className={`ml-auto ${last.confidence === CONFIDENCE.GOT_IT ? "text-accent" : last.confidence === CONFIDENCE.AGAIN ? "text-warn" : ""}`}>
                          Last practised: {CONFIDENCE_LABELS[last.confidence]}
                        </span>
                      )}
                    </div>
                    <div className="col-[2/-1] -ml-2">
                      <RequirementPicker
                        requirements={kit.role.requirements}
                        selected={f.requirement_ids}
                        onChange={(requirement_ids) => act({ type: "updateFlashcard", id: f.id, fields: { requirement_ids } })}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function AddCard({ ctx, onDone }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return setError("Both sides need text.");
    setBusy(true);
    const saved = await ctx.act({ type: "addFlashcard", flashcard: { front, back } });
    setBusy(false);
    if (saved) onDone(true);
  }
  return (
    <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onDone(false)} className="mt-6 border-l-[3px] border-accent bg-surface px-5 py-5">
      <p className="font-display text-lg text-ink">New card</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field label="Front" hint="The cue or question." multiline rows={2} maxLength={500} value={front} onChange={(e) => (setFront(e.target.value), setError(null))} autoFocus />
        <Field label="Back" hint="What you should recall." multiline rows={2} maxLength={500} value={back} onChange={(e) => (setBack(e.target.value), setError(null))} error={error} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          Add card
        </Button>
      </div>
    </form>
  );
}
