"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { post } from "@/lib/api";
import { Alert, Button, Dialog, Spinner } from "@/components/ui";
import { Toasts, useToasts } from "@/components/builder/toasts";
import { QuestionsTab, CATEGORY_LABELS } from "@/components/builder/questions-tab";
import { CoverageTab } from "@/components/builder/coverage-tab";
import { FlashcardsTab } from "@/components/builder/flashcards-tab";
import { ScheduleTab } from "@/components/builder/schedule-tab";
import { BriefTab } from "@/components/builder/brief-tab";
import { ResearchTab } from "@/components/builder/research-tab";
import { PostingTab } from "@/components/builder/posting-tab";
import { KIT_SECTIONS } from "@/components/app-shell";

const UNDO_MS = 5000;

export function KitBuilder({ doc, runOp, replace }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // The section comes from the sidebar's links (?tab=); ?setDays= opens the schedule.
  const tab = KIT_SECTIONS.some((t) => t.id === params.get("tab")) ? params.get("tab") : params.get("setDays") ? "schedule" : "questions";
  const section = KIT_SECTIONS.find((t) => t.id === tab);
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

      <h2 className="mt-10 border-b border-rule pb-3 font-display text-[26px] leading-tight text-ink">{section.label}</h2>

      <div className="mt-3">
        {tab === "posting" && <PostingTab ctx={ctx} />}
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
