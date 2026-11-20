"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { del, get } from "@/lib/api";
import { RequireAuth } from "@/components/session";
import { StatusBadge } from "@/components/status-badge";
import { Alert, Button, ButtonLink, Card, Dialog, EmptyState, Skeleton } from "@/components/ui";

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
        <h1 className="text-2xl font-semibold tracking-tight">My kits</h1>
        {kits?.length > 0 && <ButtonLink href="/kits/new">New kit</ButtonLink>}
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
          <ul className="space-y-2">
            {kits.map((kit) => (
              <li key={kit.id}>
                <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <Link href={`/kits/${kit.id}`} className="min-w-0 flex-1 rounded">
                    <p className="truncate font-medium text-zinc-900">{kit.role || "Untitled role"}</p>
                    <p className="truncate text-sm text-zinc-600">
                      {kit.company} · {kit.days} {kit.days === 1 ? "day" : "days"} · {new Date(kit.createdAt).toLocaleDateString()}
                    </p>
                  </Link>
                  <StatusBadge status={kit.status} />
                  <Button variant="ghost" size="sm" onClick={() => setToDelete(kit)} aria-label={`Delete kit for ${kit.role || kit.company}`}>
                    Delete
                  </Button>
                </Card>
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

function ListSkeleton({ bare = false }) {
  return (
    <div className={bare ? "space-y-2" : "space-y-2 pt-14"} aria-label="Loading kits">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
