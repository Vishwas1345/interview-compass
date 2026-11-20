"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { del } from "@/lib/api";
import { useKit } from "@/lib/use-kit";
import { RequireAuth } from "@/components/session";
import { ProgressView } from "@/components/progress-view";
import { StatusBadge } from "@/components/status-badge";
import { KitBuilder } from "@/components/builder/kit-builder";
import { Alert, Button, ButtonLink, Dialog, EmptyState, Skeleton } from "@/components/ui";
import { IconTrash } from "@/components/icons";
import { CONFIDENCE } from "@interview-compass/shared";

export function KitPage() {
  return (
    <RequireAuth fallback={<Skeleton className="h-96 w-full" />}>
      <KitPageInner />
    </RequireAuth>
  );
}

function KitPageInner() {
  const { id } = useParams();
  const router = useRouter();
  const { kit, error, reload, replace, runOp } = useKit(id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  if (error?.status === 404) {
    return (
      <EmptyState title="Kit not found" action={<ButtonLink href="/kits">Back to my kits</ButtonLink>}>
        It may have been deleted, or it belongs to another account.
      </EmptyState>
    );
  }
  if (error && !kit) {
    return <Alert action={<Button size="sm" variant="secondary" onClick={reload}>Try again</Button>}>{error.message}</Alert>;
  }
  if (!kit) return <BuilderSkeleton />;

  async function deleteKit() {
    setDeleting(true);
    try {
      await del(`/kits/${kit.id}`);
      router.replace("/kits");
    } catch (e) {
      setDeleteError(e.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{kit.company}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display truncate text-[34px] leading-tight text-ink">{kit.role || (kit.status === "ready" ? "Untitled role" : "New kit")}</h1>
            <StatusBadge status={kit.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {kit.days} {kit.days === 1 ? "day" : "days"} to prepare · created {new Date(kit.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Button size="sm" variant="ghost" className="text-faint hover:bg-danger-tint hover:text-danger" onClick={() => setConfirmDelete(true)}>
          <IconTrash /> Delete kit
        </Button>
      </div>
      {kit.status === "ready" && <KitStats doc={kit} />}
      {deleteError && <Alert className="mt-3">{deleteError}</Alert>}
      {kit.status === "ready" ? (
        <KitBuilder doc={kit} runOp={runOp} replace={replace} />
      ) : (
        <div className="mt-6">
          <ProgressView kit={kit} onChange={replace} />
        </div>
      )}
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this kit?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" busy={deleting} onClick={deleteKit}>
              Delete kit
            </Button>
          </>
        }
      >
        The kit, your edits and your practice history are removed for good.
      </Dialog>
    </div>
  );
}

function BuilderSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading kit">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-6 h-10 w-full" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

// The kit at a glance: what the posting asks for, how much of it is covered, how
// much there is to do, and how far practice has got.
function KitStats({ doc }) {
  const { kit, practice = {} } = doc;
  const musts = kit.role.requirements.filter((r) => r.priority === "must");
  const covered = musts.filter((r) => kit.questions.some((q) => q.requirement_ids.includes(r.id))).length;
  const cards = [...kit.questions, ...kit.flashcards];
  const gotIt = cards.filter((c) => practice[c.id]?.confidence === CONFIDENCE.GOT_IT).length;
  const minutes = kit.schedule.days.reduce((sum, d) => sum + d.minutes, 0);
  const stats = [
    { label: "Requirements", value: kit.role.requirements.length, detail: `${musts.length} must-have` },
    { label: "Must-haves covered", value: `${covered}/${musts.length}`, detail: covered === musts.length ? "all have a question" : `${musts.length - covered} without a question`, warn: covered !== musts.length },
    { label: "Questions", value: kit.questions.length, detail: `${kit.flashcards.length} flashcards` },
    { label: "Schedule", value: kit.schedule.days.length, detail: `day${kit.schedule.days.length === 1 ? "" : "s"} · about ${Math.max(1, Math.round(minutes / 60))} h` },
    { label: "Practised", value: `${gotIt}/${cards.length}`, detail: "marked Got it", progress: cards.length ? gotIt / cards.length : 0 },
  ];
  return (
    <dl className="mt-7 grid grid-cols-2 border-y border-rule sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s, i) => (
        <div key={s.label} className={`px-4 py-4 first:pl-0 ${i > 0 ? "lg:border-l lg:border-rule" : ""}`}>
          <dt className="eyebrow">{s.label}</dt>
          <dd className={`mt-1.5 font-display text-[30px] leading-none ${s.warn ? "text-warn" : "text-ink"}`}>{s.value}</dd>
          <dd className="mt-1.5 truncate text-xs text-muted">{s.detail}</dd>
          {s.progress !== undefined && (
            <dd className="mt-2 h-[3px] overflow-hidden rounded-full bg-sunken" aria-hidden="true">
              <div className="h-full bg-accent" style={{ width: `${s.progress * 100}%` }} />
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
