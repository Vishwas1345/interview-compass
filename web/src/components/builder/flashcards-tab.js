"use client";

import { useState } from "react";
import { moveInList } from "@/lib/local-ops";
import { Button, Card, EmptyState, Field } from "@/components/ui";
import { InlineEdit } from "@/components/builder/inline-edit";
import { ItemState } from "@/components/builder/item-state";
import { RequirementPicker } from "@/components/builder/questions-tab";

export function FlashcardsTab({ ctx }) {
  const { kit, act, deleteLater, pendingDeletes, show } = ctx;
  const cards = kit.flashcards.filter((f) => !pendingDeletes.has(f.id));
  const ids = cards.map((f) => f.id);
  const [adding, setAdding] = useState(false);
  const move = (id, delta) => {
    const order = moveInList(kit.flashcards.map((f) => f.id), id, delta);
    if (order) act({ type: "reorder", kind: "flashcards", ids: order });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-600">Short cards for quick recall. Practise them from the Practise button.</p>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          Add flashcard
        </Button>
      </div>
      {adding && <AddCard ctx={ctx} onDone={(added) => (setAdding(false), added && show("Flashcard added."))} />}
      {cards.length === 0 && !adding ? (
        <div className="mt-4">
          <EmptyState title="No flashcards">Add your own cards for anything you want to remember.</EmptyState>
        </div>
      ) : (
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {cards.map((f, index) => {
            const pinned = f.state === "pinned";
            return (
              <li key={f.id}>
                <Card className="flex h-full flex-col p-4">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-zinc-400">{index + 1}.</span>
                    <ItemState state={f.state} origin={f.origin} />
                  </div>
                  <InlineEdit label="Front" value={f.front} maxLength={500} onSave={(front) => act({ type: "updateFlashcard", id: f.id, fields: { front } })} className="mt-2" textClassName="font-medium" />
                  <InlineEdit label="Back" value={f.back} maxLength={500} onSave={(back) => act({ type: "updateFlashcard", id: f.id, fields: { back } })} className="mt-1" textClassName="text-sm text-zinc-700" />
                  <RequirementPicker requirements={kit.role.requirements} selected={f.requirement_ids} onChange={(requirement_ids) => act({ type: "updateFlashcard", id: f.id, fields: { requirement_ids } })} />
                  <div className="mt-auto flex flex-wrap gap-1 border-t border-zinc-100 pt-3">
                    <Button size="sm" variant="ghost" aria-label={`Move flashcard ${index + 1} up`} disabled={index === 0} onClick={() => move(f.id, -1)}>
                      ↑
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Move flashcard ${index + 1} down`} disabled={index === ids.length - 1} onClick={() => move(f.id, 1)}>
                      ↓
                    </Button>
                    <Button size="sm" variant="ghost" aria-pressed={pinned} onClick={() => act({ type: "setPinned", target: "flashcard", id: f.id, pinned: !pinned })}>
                      {pinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto text-red-700" onClick={() => deleteLater("flashcard", f.id, `flashcard ${index + 1}`)}>
                      Delete
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
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
    <Card className="mt-3 border-indigo-200 p-4">
      <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onDone(false)} className="grid gap-3 sm:grid-cols-2">
        <Field label="Front" multiline rows={2} maxLength={500} value={front} onChange={(e) => (setFront(e.target.value), setError(null))} autoFocus />
        <Field label="Back" multiline rows={2} maxLength={500} value={back} onChange={(e) => (setBack(e.target.value), setError(null))} error={error} />
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={() => onDone(false)}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Add flashcard
          </Button>
        </div>
      </form>
    </Card>
  );
}
