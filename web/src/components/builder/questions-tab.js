"use client";

import { useEffect, useId, useRef, useState } from "react";
import { QUESTION_CATEGORIES } from "@interview-compass/shared";
import { moveInList } from "@/lib/local-ops";
import { Button, Card, Dialog, EmptyState, Field, IconButton } from "@/components/ui";
import { Select } from "@/components/select";
import { IconArrowDown, IconArrowUp, IconPin, IconPlus, IconRefresh, IconTrash } from "@/components/icons";
import { InlineEdit } from "@/components/builder/inline-edit";
import { ItemState } from "@/components/builder/item-state";

export const CATEGORY_LABELS = { technical: "Technical", behavioural: "Behavioural", "system-design": "System design", "company-fit": "Company fit" };
const DIFFICULTY = { 1: "Fundamentals", 2: "Applied", 3: "Deep" };
const DIFFICULTY_OPTIONS = [
  { value: 1, label: "Fundamentals", hint: "Concepts and definitions · about 10 min" },
  { value: 2, label: "Applied", hint: "Using it in real work · about 15 min" },
  { value: 3, label: "Deep", hint: "Trade-offs and ambiguity · about 20 min" },
];

// "Applied" with a three-step meter, so difficulty reads at a glance.
function DifficultyValue({ level, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="flex items-end gap-[2px]">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`w-[3px] rounded-sm ${n <= level ? "bg-ink-soft" : "bg-rule-strong"}`} style={{ height: 4 + n * 2 }} />
        ))}
      </span>
      {label}
    </span>
  );
}

export function QuestionsTab({ ctx }) {
  const { kit, doc, pendingDeletes, regenerate, addFor, setAddFor } = ctx;
  const [confirmCategory, setConfirmCategory] = useState(null);
  const visible = kit.questions.filter((q) => !pendingDeletes.has(q.id));
  const planReason = Object.fromEntries((kit.question_plan ?? []).map((p) => [p.category, p.reason]));

  return (
    <div className="space-y-12">
      {QUESTION_CATEGORIES.map((category) => {
        const questions = visible.filter((q) => q.category === category);
        const protectedCount = questions.filter((q) => (q.state ?? "generated") !== "generated").length;
        return (
          <section key={category} aria-labelledby={`cat-${category}`}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 id={`cat-${category}`} className="flex items-baseline gap-2.5 font-display text-xl text-ink">
                  {CATEGORY_LABELS[category]} <span className="font-sans text-sm text-faint">{questions.length}</span>
                </h3>
                {planReason[category] && <p className="mt-0.5 text-xs text-muted">{planReason[category]}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAddFor({ category })}>
                  <IconPlus /> Add
                </Button>
                <Button size="sm" variant="ghost" disabled={Boolean(doc.regenerating)} onClick={() => setConfirmCategory({ category, protectedCount, total: questions.length })}>
                  <IconRefresh /> Regenerate
                </Button>
              </div>
            </div>
            {addFor?.category === category && <AddQuestionForm ctx={ctx} preset={addFor} onDone={() => setAddFor(null)} />}
            {questions.length === 0 && addFor?.category !== category ? (
              <div className="mt-3">
                <EmptyState title={`No ${CATEGORY_LABELS[category].toLowerCase()} questions`}>Add your own, or regenerate this category.</EmptyState>
              </div>
            ) : (
              <ol className="mt-4 border-t border-rule">
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
  const [showOutline, setShowOutline] = useState(false);
  const requirements = kit.role.requirements;
  const pinned = q.state === "pinned";
  const move = (delta) => {
    const order = moveInList(ids, q.id, delta);
    if (order) act({ type: "reorder", kind: "questions", category: q.category, ids: order });
  };

  return (
    <div className="group -mx-3 border-b border-rule px-3 py-4 transition-colors hover:bg-hover/50 focus-within:bg-hover/50">
      <div className="flex items-start gap-3">
        <span className="mt-[7px] w-6 shrink-0 font-mono text-xs tabular-nums text-faint">{String(position).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <InlineEdit label="Question" value={q.prompt} onSave={(prompt) => act({ type: "updateQuestion", id: q.id, fields: { prompt } })} textClassName="text-[15px] leading-relaxed text-ink" />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-muted">
            <ItemState state={q.state} origin={q.origin} />
            {q.fallback && <span className="rounded bg-sunken px-1.5 py-0.5 text-muted" title="Added by code because the model left this must-have uncovered">fallback</span>}
            <Select
              variant="compact"
              label="Difficulty"
              value={q.difficulty}
              options={DIFFICULTY_OPTIONS}
              renderValue={(o) => <DifficultyValue level={o.value} label={o.label} />}
              onChange={(difficulty) => act({ type: "updateQuestion", id: q.id, fields: { difficulty } })}
              className="-ml-1.5"
            />
            {q.requirement_ids.map((id) => {
              const r = requirements.find((x) => x.id === id);
              return (
                <span key={id} title={`${r?.text} (${r?.priority === "must" ? "must-have" : "nice to have"})`} className={`max-w-[16rem] truncate ${r?.priority === "must" ? "text-ink-soft" : "text-faint"}`}>
                  {r?.text ?? id}
                </span>
              );
            })}
            <button type="button" onClick={() => setShowOutline((v) => !v)} aria-expanded={showOutline} className="ml-auto rounded px-1 font-medium text-accent underline-offset-4 hover:underline">
              {showOutline ? "Hide outline" : "Show outline"}
            </button>
          </div>
          {showOutline && (
            <div className="mt-1.5">
              <InlineEdit
                label="Answer outline"
                value={q.answer_outline}
                allowEmpty
                placeholder="No outline yet. Click to add one."
                onSave={(answer_outline) => act({ type: "updateQuestion", id: q.id, fields: { answer_outline } })}
                textClassName="text-sm leading-relaxed text-ink-soft border-l-2 border-rule pl-3 rounded-none"
              />
              <RequirementPicker requirements={requirements} selected={q.requirement_ids} onChange={(requirement_ids) => act({ type: "updateQuestion", id: q.id, fields: { requirement_ids } })} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 transition-opacity sm:flex-row sm:items-center sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <div className="flex">
            <IconButton label={`Move question ${position} up`} disabled={position === 1} onClick={() => move(-1)}>
              <IconArrowUp />
            </IconButton>
            <IconButton label={`Move question ${position} down`} disabled={position === ids.length} onClick={() => move(1)}>
              <IconArrowDown />
            </IconButton>
            <IconButton label={pinned ? "Unpin" : "Pin: keep exactly as it is"} pressed={pinned} onClick={() => act({ type: "setPinned", target: "question", id: q.id, pinned: !pinned })}>
              <IconPin />
            </IconButton>
            <IconButton label={`Delete question ${position}`} className="hover:bg-danger-tint hover:text-danger" onClick={() => deleteLater("question", q.id, `question ${position}`)}>
              <IconTrash />
            </IconButton>
          </div>
          <Select
            variant="menu"
            label="Move to category"
            value={null}
            placeholder="Move to"
            align="right"
            options={QUESTION_CATEGORIES.filter((c) => c !== q.category).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
            onChange={(category) => act({ type: "moveQuestion", id: q.id, category })}
          />
        </div>
      </div>
    </div>
  );
}

// Which requirements a question or flashcard covers.
export function RequirementPicker({ requirements, selected, onChange, open = false }) {
  if (requirements.length === 0) return null;
  return (
    <details className="mt-1" open={open}>
      <summary className="cursor-pointer rounded px-2 text-sm text-muted hover:underline">Requirements it covers ({selected.length})</summary>
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
              {r.text} <span className="text-xs text-muted">({r.priority})</span>
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
    <Card className="mt-3 border-accent/30 p-4">
      <form ref={formRef} onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onDone()} className="space-y-3">
        <p className="text-sm font-medium">New {CATEGORY_LABELS[preset.category].toLowerCase()} question</p>
        <Field label="Question" multiline rows={2} maxLength={2000} value={prompt} onChange={(e) => (setPrompt(e.target.value), setError(null))} error={error} />
        <Field label="Answer outline (optional)" multiline rows={2} maxLength={2000} value={outline} onChange={(e) => setOutline(e.target.value)} />
        <div className="max-w-xs">
          <p id={difficultyId} className="text-[13px] font-medium text-ink">
            Difficulty
          </p>
          <Select className="mt-1.5" label="Difficulty" value={difficulty} options={DIFFICULTY_OPTIONS} onChange={setDifficulty} />
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
