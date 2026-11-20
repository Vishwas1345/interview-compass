"use client";

import { useEffect, useId, useRef, useState } from "react";
import { QUESTION_CATEGORIES } from "@interview-compass/shared";
import { moveInList } from "@/lib/local-ops";
import { Button, Card, Dialog, EmptyState, Field } from "@/components/ui";
import { InlineEdit } from "@/components/builder/inline-edit";
import { ItemState } from "@/components/builder/item-state";

export const CATEGORY_LABELS = { technical: "Technical", behavioural: "Behavioural", "system-design": "System design", "company-fit": "Company fit" };
const DIFFICULTY = { 1: "Fundamentals", 2: "Applied", 3: "Deep" };

export function QuestionsTab({ ctx }) {
  const { kit, doc, pendingDeletes, regenerate, addFor, setAddFor } = ctx;
  const [confirmCategory, setConfirmCategory] = useState(null);
  const visible = kit.questions.filter((q) => !pendingDeletes.has(q.id));
  const planReason = Object.fromEntries((kit.question_plan ?? []).map((p) => [p.category, p.reason]));

  return (
    <div className="space-y-8">
      {QUESTION_CATEGORIES.map((category) => {
        const questions = visible.filter((q) => q.category === category);
        const protectedCount = questions.filter((q) => (q.state ?? "generated") !== "generated").length;
        return (
          <section key={category} aria-labelledby={`cat-${category}`}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id={`cat-${category}`} className="text-lg font-semibold">
                  {CATEGORY_LABELS[category]} <span className="text-sm font-normal text-zinc-500">({questions.length})</span>
                </h2>
                {planReason[category] && <p className="text-xs text-zinc-500">Why: {planReason[category]}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setAddFor({ category })}>
                  Add question
                </Button>
                <Button size="sm" variant="secondary" disabled={Boolean(doc.regenerating)} onClick={() => setConfirmCategory({ category, protectedCount, total: questions.length })}>
                  Regenerate
                </Button>
              </div>
            </div>
            {addFor?.category === category && <AddQuestionForm ctx={ctx} preset={addFor} onDone={() => setAddFor(null)} />}
            {questions.length === 0 && addFor?.category !== category ? (
              <div className="mt-3">
                <EmptyState title={`No ${CATEGORY_LABELS[category].toLowerCase()} questions`}>Add your own, or regenerate this category.</EmptyState>
              </div>
            ) : (
              <ol className="mt-3 space-y-3">
                {questions.map((q, index) => (
                  <li key={q.id} id={q.id}>
                    <QuestionCard ctx={ctx} question={q} ids={questions.map((x) => x.id)} position={index + 1} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}

      <Dialog
        open={Boolean(confirmCategory)}
        onClose={() => setConfirmCategory(null)}
        title={confirmCategory ? `Regenerate ${CATEGORY_LABELS[confirmCategory.category]} questions?` : ""}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmCategory(null)}>
              Cancel
            </Button>
            <Button onClick={() => (regenerate({ target: "category", category: confirmCategory.category }), setConfirmCategory(null))}>Regenerate</Button>
          </>
        }
      >
        {confirmCategory && (
          <p>
            {confirmCategory.protectedCount > 0
              ? `Your ${confirmCategory.protectedCount} edited or pinned question${confirmCategory.protectedCount === 1 ? " stays" : "s stay"} exactly as ${confirmCategory.protectedCount === 1 ? "it is" : "they are"}. `
              : ""}
            The other {confirmCategory.total - confirmCategory.protectedCount} AI question(s) in this category are replaced with new ones. Questions you deleted are not suggested again. Coverage is checked again afterwards.
          </p>
        )}
      </Dialog>
    </div>
  );
}

function QuestionCard({ ctx, question: q, ids, position }) {
  const { kit, act, deleteLater } = ctx;
  const requirements = kit.role.requirements;
  const pinned = q.state === "pinned";
  const move = (delta) => {
    const order = moveInList(ids, q.id, delta);
    if (order) act({ type: "reorder", kind: "questions", category: q.category, ids: order });
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-zinc-400">{position}.</span>
        <ItemState state={q.state} origin={q.origin} />
        {q.fallback && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600" title="Added by code because the model left this must-have uncovered">fallback</span>}
        <label className="sr-only" htmlFor={`diff-${q.id}`}>Difficulty</label>
        <select
          id={`diff-${q.id}`}
          value={q.difficulty}
          onChange={(e) => act({ type: "updateQuestion", id: q.id, fields: { difficulty: Number(e.target.value) } })}
          className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs"
        >
          {[1, 2, 3].map((d) => (
            <option key={d} value={d}>
              {d} · {DIFFICULTY[d]}
            </option>
          ))}
        </select>
        {q.requirement_ids.map((id) => {
          const r = requirements.find((x) => x.id === id);
          return (
            <span key={id} title={r?.text} className={`max-w-[16rem] truncate rounded-full px-2 py-0.5 ${r?.priority === "must" ? "bg-indigo-50 text-indigo-800" : "bg-zinc-100 text-zinc-700"}`}>
              {r?.text ?? id}
            </span>
          );
        })}
      </div>
      <InlineEdit label="Question" value={q.prompt} onSave={(prompt) => act({ type: "updateQuestion", id: q.id, fields: { prompt } })} className="mt-2" textClassName="font-medium text-zinc-900" />
      <details className="mt-2 group">
        <summary className="cursor-pointer rounded px-2 text-sm text-indigo-700 hover:underline">Answer outline</summary>
        <InlineEdit
          label="Answer outline"
          value={q.answer_outline}
          allowEmpty
          placeholder="No outline yet. Click to add one."
          onSave={(answer_outline) => act({ type: "updateQuestion", id: q.id, fields: { answer_outline } })}
          className="mt-1"
          textClassName="text-sm text-zinc-700"
        />
      </details>
      <RequirementPicker
        requirements={requirements}
        selected={q.requirement_ids}
        onChange={(requirement_ids) => act({ type: "updateQuestion", id: q.id, fields: { requirement_ids } })}
      />
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-zinc-100 pt-3">
        <Button size="sm" variant="ghost" aria-label={`Move question ${position} up`} disabled={position === 1} onClick={() => move(-1)}>
          ↑ Up
        </Button>
        <Button size="sm" variant="ghost" aria-label={`Move question ${position} down`} disabled={position === ids.length} onClick={() => move(1)}>
          ↓ Down
        </Button>
        <label className="sr-only" htmlFor={`move-${q.id}`}>Move to category</label>
        <select
          id={`move-${q.id}`}
          value=""
          onChange={(e) => e.target.value && act({ type: "moveQuestion", id: q.id, category: e.target.value })}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700"
        >
          <option value="">Move to…</option>
          {QUESTION_CATEGORIES.filter((c) => c !== q.category).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" aria-pressed={pinned} onClick={() => act({ type: "setPinned", target: "question", id: q.id, pinned: !pinned })}>
          {pinned ? "Unpin" : "Pin"}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto text-red-700" onClick={() => deleteLater("question", q.id, `question ${position}`)}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

// Which requirements a question or flashcard covers.
export function RequirementPicker({ requirements, selected, onChange, open = false }) {
  if (requirements.length === 0) return null;
  return (
    <details className="mt-1" open={open}>
      <summary className="cursor-pointer rounded px-2 text-sm text-zinc-600 hover:underline">Requirements it covers ({selected.length})</summary>
      <fieldset className="mt-2 grid gap-1 px-2 sm:grid-cols-2">
        <legend className="sr-only">Requirements it covers</legend>
        {requirements.map((r) => (
          <label key={r.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={selected.includes(r.id)}
              onChange={(e) => onChange(e.target.checked ? [...selected, r.id] : selected.filter((id) => id !== r.id))}
            />
            <span>
              {r.text} <span className="text-xs text-zinc-500">({r.priority})</span>
            </span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}

function AddQuestionForm({ ctx, preset, onDone }) {
  const { kit, act, show } = ctx;
  const [prompt, setPrompt] = useState("");
  const [outline, setOutline] = useState("");
  const [difficulty, setDifficulty] = useState(2);
  const [requirementIds, setRequirementIds] = useState(preset.requirementId ? [preset.requirementId] : []);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const difficultyId = useId();
  useEffect(() => {
    formRef.current?.querySelector("textarea")?.focus();
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!prompt.trim()) return setError("Write the question.");
    setBusy(true);
    const saved = await act({ type: "addQuestion", question: { category: preset.category, prompt, answer_outline: outline, difficulty, requirement_ids: requirementIds } });
    setBusy(false);
    if (saved) {
      show("Question added. It is yours: regeneration keeps it.");
      onDone();
    }
  }

  return (
    <Card className="mt-3 border-indigo-200 p-4">
      <form ref={formRef} onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onDone()} className="space-y-3">
        <p className="text-sm font-medium">New {CATEGORY_LABELS[preset.category].toLowerCase()} question</p>
        <Field label="Question" multiline rows={2} maxLength={2000} value={prompt} onChange={(e) => (setPrompt(e.target.value), setError(null))} error={error} />
        <Field label="Answer outline (optional)" multiline rows={2} maxLength={2000} value={outline} onChange={(e) => setOutline(e.target.value)} />
        <div>
          <label htmlFor={difficultyId} className="block text-sm font-medium text-zinc-800">
            Difficulty
          </label>
          <select id={difficultyId} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm">
            {[1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {d} · {DIFFICULTY[d]}
              </option>
            ))}
          </select>
        </div>
        <RequirementPicker requirements={kit.role.requirements} selected={requirementIds} onChange={setRequirementIds} open />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Add question
          </Button>
        </div>
      </form>
    </Card>
  );
}
