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
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{kit.role || (kit.status === "ready" ? "Untitled role" : "New kit")}</h1>
          <p className="text-sm text-zinc-600">
            {kit.company} · {kit.days} {kit.days === 1 ? "day" : "days"}
            {kit.kit && ` · ${kit.kit.role.requirements.length} requirements · ${kit.kit.questions.length} questions · ${kit.kit.flashcards.length} flashcards`}
          </p>
        </div>
        <StatusBadge status={kit.status} />
      </div>
      {deleteError && <Alert className="mb-3">{deleteError}</Alert>}
      {kit.status === "ready" ? (
        <KitBuilder doc={kit} runOp={runOp} replace={replace} onDelete={() => setConfirmDelete(true)} />
      ) : (
        <ProgressView kit={kit} onChange={replace} />
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
