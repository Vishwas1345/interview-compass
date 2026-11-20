"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { del, get } from "@/lib/api";
import { RequireAuth } from "@/components/session";
import { StatusBadge } from "@/components/status-badge";
import { Alert, Button, ButtonLink, Dialog, EmptyState, IconButton, Skeleton } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";

export function KitList() {
  return (
    <RequireAuth fallback={<ListSkeleton />}>
      <KitListInner />
    </RequireAuth>
  );
}

function KitListInner() {
  const [kits, setKits] = useState(null);
  const [error, setError] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setKits((await get("/kits")).kits);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    get("/kits")
      .then((data) => !cancelled && setKits(data.kits))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await del(`/kits/${toDelete.id}`);
      setKits((list) => list.filter((k) => k.id !== toDelete.id));
      setToDelete(null);
    } catch (e) {
      setError(e.message);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[34px] leading-tight text-ink">My kits</h1>
          {kits?.length > 0 && <p className="mt-0.5 text-sm text-muted">{kits.length} kit{kits.length === 1 ? "" : "s"}. Open one to edit it or practise.</p>}
        </div>
        {kits?.length > 0 && (
          <ButtonLink href="/kits/new">
            <IconPlus /> New kit
          </ButtonLink>
        )}
      </div>
      <div className="mt-6">
        {error && (
          <Alert action={<Button variant="secondary" size="sm" onClick={() => (setError(null), setKits(null), load())}>Try again</Button>}>
            {error}
          </Alert>
        )}
        {!error && kits === null && <ListSkeleton bare />}
        {kits?.length === 0 && (
          <EmptyState title="No kits yet" action={<ButtonLink href="/kits/new">Create your first kit</ButtonLink>}>
            Paste a job description and the company website. Your first kit takes about two minutes.
          </EmptyState>
        )}
        {kits?.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {kits.map((kit) => (
              <li key={kit.id}>
                <KitCard kit={kit} onDelete={() => setToDelete(kit)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Dialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Delete this kit?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" busy={deleting} onClick={confirmDelete}>
              Delete kit
            </Button>
          </>
        }
      >
        {toDelete && (
          <p>
            The kit for <strong>{toDelete.role || toDelete.company}</strong>, with its edits and practice history, will be removed for good.
          </p>
        )}
      </Dialog>
    </div>
  );
}

function KitCard({ kit, onDelete }) {
  const c = kit.counts;
  const cards = c ? c.questions + c.flashcards : 0;
  return (
    <div className="group relative flex h-full flex-col rounded-lg border border-rule bg-surface p-5 transition hover:-translate-y-0.5 hover:border-ink/40 hover:shadow-[0_14px_32px_-20px_rgb(28_27_25/0.45)] focus-within:border-ink/40">
      <div className="flex items-start justify-between gap-2">
        <StatusBadge status={kit.status} />
        <IconButton label={`Delete kit for ${kit.role || kit.company}`} className="relative z-10 -mr-1 -mt-1 hover:bg-danger-tint hover:text-danger" onClick={onDelete}>
          <IconTrash />
        </IconButton>
      </div>
      {/* The whole card is the link; the delete button sits above it. */}
      <Link href={`/kits/${kit.id}`} className="mt-3 rounded after:absolute after:inset-0 after:content-['']">
        <p className="eyebrow truncate">{kit.company}</p>
        <p className="mt-1 line-clamp-2 font-display text-[22px] leading-snug text-ink">{kit.role || (kit.status === "ready" ? "Untitled role" : "Generating…")}</p>
      </Link>
      {kit.status === "ready" && c ? (
        <>
          <p className="mt-3 text-xs text-muted">
            {c.requirements} requirements · {c.questions} questions · {kit.days} {kit.days === 1 ? "day" : "days"}
          </p>
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-muted">
              <span>Practised</span>
              <span>
                {c.gotIt}/{cards} got it
              </span>
            </div>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-sunken" aria-hidden="true">
              <div className="h-full bg-accent" style={{ width: `${cards ? (c.gotIt / cards) * 100 : 0}%` }} />
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-muted">
          {kit.days} {kit.days === 1 ? "day" : "days"} · {kit.status === "generating" ? "building now" : "open it to see why"}
        </p>
      )}
      <p className="mt-auto pt-4 text-[11px] text-faint">{new Date(kit.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
    </div>
  );
}

function ListSkeleton({ bare = false }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${bare ? "" : "pt-14"}`} aria-label="Loading kits">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}
