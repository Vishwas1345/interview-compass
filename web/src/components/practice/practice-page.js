"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { orderDeck, requirementProgress, CONFIDENCE, CONFIDENCE_LABELS } from "@interview-compass/shared";
import { post } from "@/lib/api";
import { useKit } from "@/lib/use-kit";
import { RequireAuth } from "@/components/session";
import { Alert, Button, ButtonLink, Card, EmptyState, Skeleton } from "@/components/ui";
import { CATEGORY_LABELS } from "@/components/builder/questions-tab";
import { Coach } from "@/components/practice/coach";

export function PracticePage() {
  return (
    <RequireAuth fallback={<Skeleton className="h-96 w-full" />}>
      <PracticeInner />
    </RequireAuth>
  );
}

// Questions and flashcards become one card shape: a prompt and its answer.
function deckItems(kit, deck, day) {
  if (deck === "flashcards") {
    return kit.flashcards.map((f) => ({ id: f.id, kind: "Flashcard", prompt: f.front, answer: f.back, requirement_ids: f.requirement_ids, isQuestion: false }));
  }
  const ids = deck === "day" ? new Set(kit.schedule.days.find((d) => d.day === day)?.question_ids ?? []) : null;
  return kit.questions
    .filter((q) => !ids || ids.has(q.id))
    .map((q) => ({ id: q.id, kind: CATEGORY_LABELS[q.category], prompt: q.prompt, answer: q.answer_outline, requirement_ids: q.requirement_ids, isQuestion: true }));
}

// Default day: the first one with a question not yet marked "Got it".
function firstOpenDay(kit, practice) {
  const open = kit.schedule.days.find((d) => d.question_ids.some((id) => practice[id]?.confidence !== CONFIDENCE.GOT_IT));
  return open?.day ?? 1;
}

function PracticeInner() {
  const { id } = useParams();
  const { kit: doc, error, replace } = useKit(id);
  const [session, setSession] = useState(null); // { deck, day, cards, index, revealed, marks }

  if (error?.status === 404) {
    return (
      <EmptyState title="Kit not found" action={<ButtonLink href="/kits">Back to my kits</ButtonLink>}>
        It may have been deleted, or it belongs to another account.
      </EmptyState>
    );
  }
  if (error && !doc) return <Alert>{error.message}</Alert>;
  if (!doc) return <Skeleton className="h-96 w-full" />;
  if (doc.status !== "ready") {
    return (
      <EmptyState title="This kit is not ready yet" action={<ButtonLink href={`/kits/${id}`}>See its progress</ButtonLink>}>
        Practice opens once the kit has finished generating.
      </EmptyState>
    );
  }

  const kit = doc.kit;
  const practice = doc.practice ?? {};
  const allItems = [...deckItems(kit, "questions"), ...deckItems(kit, "flashcards")];

  function start(deck, day) {
    // The order is fixed for the session; the next session re-sorts with the new marks.
    const cards = orderDeck(deckItems(kit, deck, day), practice, kit.role.requirements);
    setSession({ deck, day, cards, index: 0, revealed: false, marks: {} });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Practise</h1>
          <p className="truncate text-sm text-zinc-600">
            <Link href={`/kits/${id}`} className="text-indigo-700 hover:underline">
              {doc.role || "Untitled role"} · {doc.company}
            </Link>
          </p>
        </div>
        {session && (
          <Button variant="secondary" size="sm" onClick={() => setSession(null)}>
            Change deck
          </Button>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div>
          {session ? (
            <Session session={session} setSession={setSession} doc={doc} replace={replace} onRestart={() => start(session.deck, session.day)} />
          ) : (
            <DeckPicker kit={kit} practice={practice} onStart={start} />
          )}
        </div>
        <Progress kit={kit} items={allItems} practice={practice} />
      </div>
    </div>
  );
}

function DeckPicker({ kit, practice, onStart }) {
  const [day, setDay] = useState(() => firstOpenDay(kit, practice));
  const dayCount = kit.schedule.days.find((d) => d.day === day)?.question_ids.length ?? 0;
  const options = [
    { deck: "day", title: `Day ${day} of your schedule`, detail: `${dayCount} question${dayCount === 1 ? "" : "s"}`, disabled: dayCount === 0 },
    { deck: "questions", title: "All questions", detail: `${kit.questions.length} questions` , disabled: kit.questions.length === 0 },
    { deck: "flashcards", title: "All flashcards", detail: `${kit.flashcards.length} cards`, disabled: kit.flashcards.length === 0 },
  ];
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Choose what to practise</h2>
      <p className="mt-1 text-sm text-zinc-600">Cards come weakest first: the ones you have not seen or marked “Again”, must-haves before nice-to-haves.</p>
      <div className="mt-3">
        <label htmlFor="practice-day" className="text-sm text-zinc-700">
          Schedule day{" "}
        </label>
        <select id="practice-day" value={day} onChange={(e) => setDay(Number(e.target.value))} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm">
          {kit.schedule.days.map((d) => (
            <option key={d.day} value={d.day}>
              Day {d.day}
              {d.kind === "review" ? " (review)" : ""}
            </option>
          ))}
        </select>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <li key={o.deck}>
            <button
              type="button"
              disabled={o.disabled}
              onClick={() => onStart(o.deck, day)}
              className="h-full w-full rounded-lg border border-zinc-200 bg-white p-4 text-left hover:border-indigo-400 hover:bg-indigo-50/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block font-medium text-zinc-900">{o.title}</span>
              <span className="text-sm text-zinc-600">{o.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Session({ session, setSession, doc, replace, onRestart }) {
  const [saveError, setSaveError] = useState(null);
  const card = session.cards[session.index];
  const done = session.index >= session.cards.length;
  const requirementsById = useMemo(() => new Map(doc.kit.role.requirements.map((r) => [r.id, r])), [doc.kit.role.requirements]);

  const reveal = () => setSession((s) => ({ ...s, revealed: true }));
  const go = (delta) => setSession((s) => ({ ...s, index: Math.min(s.cards.length, Math.max(0, s.index + delta)), revealed: false }));

  async function mark(confidence) {
    if (!card) return;
    const itemId = card.id;
    const previous = doc.practice?.[itemId];
    const setEntry = (entry) => replace((current) => ({ ...current, practice: { ...current.practice, [itemId]: entry } }));
    // Show the mark at once; the server's answer confirms it, or it is rolled back.
    setEntry({ ...previous, confidence, lastAt: new Date().toISOString(), count: (previous?.count ?? 0) + 1 });
    setSession((s) => ({ ...s, marks: { ...s.marks, [itemId]: confidence }, index: s.index + 1, revealed: false }));
    try {
      const { entry } = await post(`/kits/${doc.id}/practice`, { itemId, confidence });
      setEntry(entry);
      setSaveError(null);
    } catch (e) {
      setEntry(previous);
      setSaveError(`Your last mark was not saved: ${e.message}`);
    }
  }

  // Keyboard: Space reveals, 1/2/3 mark, arrows move. Off while typing an answer.
  useEffect(() => {
    function onKey(e) {
      const typing = ["TEXTAREA", "INPUT", "SELECT"].includes(e.target.tagName);
      if (typing || e.metaKey || e.ctrlKey || e.altKey || done) return;
      if (e.key === " " && !session.revealed) {
        e.preventDefault();
        reveal();
      } else if (["1", "2", "3"].includes(e.key) && session.revealed) {
        e.preventDefault();
        mark(Number(e.key));
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (session.cards.length === 0) {
    return <EmptyState title="Nothing in this deck">Choose another deck, or add questions in the builder.</EmptyState>;
  }
  if (done) {
    const counts = [CONFIDENCE.AGAIN, CONFIDENCE.UNSURE, CONFIDENCE.GOT_IT].map((c) => Object.values(session.marks).filter((m) => m === c).length);
    return (
      <Card className="p-6 text-center">
        <h2 className="text-lg font-semibold">Session complete</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {counts[2]} got it · {counts[1]} unsure · {counts[0]} again
        </p>
        <p className="mt-3 text-sm text-zinc-700">The next session starts with the cards you marked “Again”, then “Unsure”.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={onRestart}>Start the next session</Button>
          <Button variant="secondary" onClick={() => setSession(null)}>
            Choose another deck
          </Button>
        </div>
      </Card>
    );
  }

  const last = doc.practice?.[card.id];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm text-zinc-600">
        <span>
          Card {session.index + 1} of {session.cards.length}
        </span>
        <span>{last ? `Last time: ${CONFIDENCE_LABELS[last.confidence]}` : "New card"}</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-200" aria-hidden="true">
        <div className="h-full bg-indigo-600 transition-all" style={{ width: `${(session.index / session.cards.length) * 100}%` }} />
      </div>
      {saveError && <Alert className="mb-3">{saveError}</Alert>}
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{card.kind}</p>
        <p className="mt-2 text-lg font-medium text-zinc-900">{card.prompt}</p>
        {card.requirement_ids.length > 0 && (
          <p className="mt-2 text-xs text-zinc-500">Tests: {card.requirement_ids.map((id) => requirementsById.get(id)?.text ?? id).join(" · ")}</p>
        )}

        <Coach key={card.id} kitId={doc.id} card={card} />

        {session.revealed ? (
          <div className="mt-4 rounded-md bg-zinc-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{card.isQuestion ? "What a strong answer covers" : "Answer"}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{card.answer || "No outline for this question yet. Add one in the builder."}</p>
          </div>
        ) : (
          <Button className="mt-4" onClick={reveal}>
            Reveal answer <kbd className="rounded bg-white/20 px-1 text-xs">Space</kbd>
          </Button>
        )}

        {session.revealed && (
          <div className="mt-4">
            <p className="text-sm font-medium text-zinc-800">How confident were you?</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[CONFIDENCE.AGAIN, CONFIDENCE.UNSURE, CONFIDENCE.GOT_IT].map((c) => (
                <Button key={c} variant={c === CONFIDENCE.GOT_IT ? "primary" : "secondary"} onClick={() => mark(c)}>
                  {CONFIDENCE_LABELS[c]} <kbd className="rounded bg-black/10 px-1 text-xs">{c}</kbd>
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>
      <div className="mt-3 flex justify-between">
        <Button variant="ghost" size="sm" disabled={session.index === 0} onClick={() => go(-1)}>
          ← Previous
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(1)}>
          Skip →
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-zinc-500">Shortcuts: Space reveals · 1 / 2 / 3 mark · ← → move</p>
    </div>
  );
}

// Covered vs not yet covered, per requirement (app spec: Practice → Progress).
function Progress({ kit, items, practice }) {
  const rows = requirementProgress(kit.role.requirements, items, practice);
  const covered = rows.filter((r) => r.gotIt > 0).length;
  if (rows.length === 0) return null;
  return (
    <Card className="h-fit p-4">
      <h2 className="text-sm font-semibold">Your progress</h2>
      <p className="mt-0.5 text-xs text-zinc-600">
        {covered} of {rows.length} requirements have at least one card marked “Got it”.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="flex justify-between gap-2 text-xs">
              <span className={`truncate ${r.priority === "must" ? "font-medium text-zinc-900" : "text-zinc-600"}`} title={r.text}>
                {r.text}
              </span>
              <span className="shrink-0 text-zinc-500">
                {r.gotIt}/{r.total}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200" role="img" aria-label={`${r.text}: ${r.gotIt} of ${r.total} cards got it`}>
              <div className={`h-full ${r.gotIt > 0 ? "bg-emerald-500" : "bg-zinc-300"}`} style={{ width: r.total ? `${(r.gotIt / r.total) * 100}%` : "0%" }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
