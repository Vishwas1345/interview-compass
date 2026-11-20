"use client";

import { useParams } from "next/navigation";
import { useKit } from "@/lib/use-kit";
import { RequireAuth } from "@/components/session";
import { ProgressView } from "@/components/progress-view";
import { StatusBadge } from "@/components/status-badge";
import { Alert, Button, ButtonLink, EmptyState, Skeleton } from "@/components/ui";

export function KitPage() {
  return (
    <RequireAuth fallback={<Skeleton className="h-96 w-full" />}>
      <KitPageInner />
    </RequireAuth>
  );
}

function KitPageInner() {
  const { id } = useParams();
  const { kit, setKit, error, reload } = useKit(id);

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
  if (!kit) return <Skeleton className="h-96 w-full" />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{kit.role || "New kit"}</h1>
          <p className="text-sm text-zinc-600">
            {kit.company} · {kit.days} {kit.days === 1 ? "day" : "days"}
          </p>
        </div>
        <StatusBadge status={kit.status} />
      </div>
      {kit.status === "ready" ? <ReadySummary kit={kit} /> : <ProgressView kit={kit} onChange={setKit} />}
    </div>
  );
}

// Placeholder until the builder (next phase) replaces it.
function ReadySummary({ kit }) {
  const k = kit.kit;
  return (
    <div className="space-y-2 text-sm">
      <p>
        {k.role.requirements.length} requirements · {k.questions.length} questions · {k.flashcards.length} flashcards · {k.schedule.days.length} days
      </p>
      <p className="text-zinc-600">{k.company_brief.summary}</p>
    </div>
  );
}
