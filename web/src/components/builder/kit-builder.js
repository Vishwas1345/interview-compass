"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { post } from "@/lib/api";
import { Alert, Button, ButtonLink, Dialog, Spinner } from "@/components/ui";
import { Toasts, useToasts } from "@/components/builder/toasts";
import { QuestionsTab, CATEGORY_LABELS } from "@/components/builder/questions-tab";
import { CoverageTab } from "@/components/builder/coverage-tab";
import { FlashcardsTab } from "@/components/builder/flashcards-tab";
import { ScheduleTab } from "@/components/builder/schedule-tab";
import { BriefTab } from "@/components/builder/brief-tab";
import { ResearchTab } from "@/components/builder/research-tab";

const TABS = [
  { id: "questions", label: "Questions" },
  { id: "coverage", label: "Requirements & coverage" },
  { id: "flashcards", label: "Flashcards" },
  { id: "schedule", label: "Schedule" },
  { id: "brief", label: "Company brief" },
  { id: "research", label: "Research" },
];
const UNDO_MS = 5000;

export function KitBuilder({ doc, runOp, replace, onDelete }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : params.get("setDays") ? "schedule" : "questions";
  const { toasts, show, dismiss } = useToasts();
  const [confirmBrief, setConfirmBrief] = useState(false);
  const [addFor, setAddFor] = useState(null); // { category, requirementId } to open the add form

  const selectTab = useCallback(
    (id) => {
      const next = new URLSearchParams(params);
      next.set("tab", id);
      next.delete("setDays");
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // Every builder change goes through here: errors roll back (in useKit) and are said.
  const act = useCallback(
    async (op) => {
      try {
        return await runOp(op);
      } catch (e) {
        show(e.code === "VERSION_CONFLICT" ? e.message : `Not saved: ${e.message}`, { tone: "error", ms: 7000 });
        return null;
      }
    },
    [runOp, show],
  );

  // Delete with Undo: the item hides at once; the delete is sent after a few seconds
  // unless undone, or immediately if the page closes.
  const [pendingDeletes, setPendingDeletes] = useState(() => new Set());
  const timers = useRef(new Map());
  const deleteLater = useCallback(
    (kind, id, description) => {
      const send = () => {
        timers.current.delete(id);
        setPendingDeletes((s) => new Set([...s].filter((x) => x !== id)));
        act({ type: kind === "question" ? "deleteQuestion" : "deleteFlashcard", id });
      };
      setPendingDeletes((s) => new Set(s).add(id));
      timers.current.set(id, setTimeout(send, UNDO_MS));
      show(`Deleted ${description}.`, {
        ms: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            clearTimeout(timers.current.get(id));
            timers.current.delete(id);
            setPendingDeletes((s) => new Set([...s].filter((x) => x !== id)));
          },
        },
      });
    },
    [act, show],
  );
  // Leaving the page sends any delete still waiting out its Undo, one after another
  // (each needs the version the previous one produced).
  const latestVersion = useRef(doc.version);
  useEffect(() => {
    latestVersion.current = doc.version;
  }, [doc.version]);
  useEffect(() => {
    const pending = timers.current;
    const kitId = doc.id;
    return () => {
      const ids = [...pending.keys()];
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
      (async () => {
        let version = latestVersion.current;
        for (const id of ids) {
          try {
            const { kit } = await post(`/kits/${kitId}/ops`, { version, op: { type: id.startsWith("q") ? "deleteQuestion" : "deleteFlashcard", id } });
            version = kit.version;
          } catch {
            // best effort on the way out
          }
        }
      })();
    };
  }, [doc.id]);

  const regenerate = useCallback(
    async (request) => {
      try {
        replace((await post(`/kits/${doc.id}/regenerate`, request)).kit);
      } catch (e) {
        if (e.code === "CONFIRM_REQUIRED") return setConfirmBrief(true);
        show(e.message, { tone: "error", ms: 7000 });
      }
    },
    [doc.id, replace, show],
  );

  // When a regeneration finishes, say what happened.
  const wasRegenerating = useRef(doc.regenerating);
  useEffect(() => {
    const was = wasRegenerating.current;
    wasRegenerating.current = doc.regenerating;
    if (!was || doc.regenerating) return;
    const last = doc.lastRegeneration;
    if (last?.error) return show(last.error.message, { tone: "error", ms: 8000 });
    if (last?.target === "brief") return show(last.replaced?.length ? "Brief rewritten. Pinned fields were kept." : "Nothing replaced: every brief field is pinned or edited.");
    if (last?.target === "category") {
      show(`${CATEGORY_LABELS[last.category]}: kept ${last.kept?.length ?? 0} of yours, replaced ${last.removed?.length ?? 0}, added ${last.added?.length ?? 0}.`, { ms: 8000 });
    }
  }, [doc.regenerating, doc.lastRegeneration, show]);

  const kit = doc.kit;
  const ctx = { doc, kit, act, deleteLater, pendingDeletes, regenerate, show, selectTab, addFor, setAddFor };
  const uncovered = doc.warnings.filter((w) => w.code === "MUST_UNCOVERED");

  return (
    <div>
      <div className="space-y-2">
        {doc.regenerating && (
          <Alert tone="info">
            <span className="inline-flex items-center gap-2">
              <Spinner /> Regenerating {doc.regenerating.target === "brief" ? "the company brief" : `${CATEGORY_LABELS[doc.regenerating.category]} questions`}. Keep editing: your changes are kept.
            </span>
          </Alert>
        )}
        {uncovered.length > 0 && (
          <Alert
            tone="warning"
            title={`${uncovered.length} must-have requirement${uncovered.length === 1 ? " has" : "s have"} no question`}
            action={<Button size="sm" variant="secondary" onClick={() => selectTab("coverage")}>Review coverage</Button>}
          >
            {uncovered.map((w) => kit.role.requirements.find((r) => r.id === w.requirement_id)?.text).join(" · ")}
          </Alert>
        )}
        {doc.scheduleStale && tab !== "schedule" && (
          <Alert tone="info" action={<Button size="sm" variant="secondary" onClick={() => selectTab("schedule")}>Rebuild schedule</Button>}>
            Your questions changed since this schedule was built.
          </Alert>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="tab-select">Section</label>
        <select id="tab-select" value={tab} onChange={(e) => selectTab(e.target.value)} className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm sm:hidden">
          {TABS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <TabList tab={tab} onSelect={selectTab} />
        <div className="flex gap-2 sm:ml-auto">
          <ButtonLink href={`/kits/${doc.id}/practice`} size="sm">
            Practise
          </ButtonLink>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            Delete kit
          </Button>
        </div>
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4">
        {tab === "questions" && <QuestionsTab ctx={ctx} />}
        {tab === "coverage" && <CoverageTab ctx={ctx} />}
        {tab === "flashcards" && <FlashcardsTab ctx={ctx} />}
        {tab === "schedule" && <ScheduleTab ctx={ctx} initialDays={params.get("setDays")} />}
        {tab === "brief" && <BriefTab ctx={ctx} />}
        {tab === "research" && <ResearchTab ctx={ctx} />}
      </div>

      <Dialog
        open={confirmBrief}
        onClose={() => setConfirmBrief(false)}
        title="You edited this brief. Replace it anyway?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmBrief(false)}>
              Keep my edits
            </Button>
            <Button onClick={() => (setConfirmBrief(false), regenerate({ target: "brief", confirm: true }))}>Replace edited text</Button>
          </>
        }
      >
        A new brief is written from the pages found during research. Edited fields are replaced; pinned fields are always kept.
      </Dialog>
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

// Tabs with arrow-key navigation (WAI-ARIA tabs pattern). Hidden on phones, where the
// select above takes over.
function TabList({ tab, onSelect }) {
  const refs = useRef({});
  function onKeyDown(e) {
    const index = TABS.findIndex((t) => t.id === tab);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (e.key === "Home" || e.key === "End" || step) {
      e.preventDefault();
      const next = e.key === "Home" ? TABS[0] : e.key === "End" ? TABS.at(-1) : TABS[(index + step + TABS.length) % TABS.length];
      onSelect(next.id);
      refs.current[next.id]?.focus();
    }
  }
  return (
    <div role="tablist" aria-label="Kit sections" onKeyDown={onKeyDown} className="hidden flex-wrap gap-1 rounded-lg bg-zinc-100 p-1 sm:flex">
      {TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => (refs.current[t.id] = el)}
          id={`tab-${t.id}`}
          role="tab"
          type="button"
          aria-selected={tab === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => onSelect(t.id)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
