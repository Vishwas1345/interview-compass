import { Card } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { CATEGORY_LABELS } from "@/components/builder/questions-tab";

export function ResearchTab({ ctx }) {
  const { kit } = ctx;
  const r = kit.research ?? {};
  const found = [
    ["About page", r.about_page_found],
    ["Hiring or interview page", r.hiring_page_found],
    ["Public interview discussion", r.discussion_found],
  ];
  return (
    <div className="space-y-3">
      {r.notes?.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Notes</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {r.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="p-4">
        <h2 className="text-sm font-semibold">What was found</h2>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-3">
          {found.map(([label, ok]) => (
            <li key={label}>
              <span aria-hidden="true" className={`mr-1 inline-grid h-4 w-4 place-items-center rounded-full align-[-3px] ${ok ? "bg-accent text-surface" : "bg-sunken text-faint"}`}>{ok ? <IconCheck className="h-2.5 w-2.5" /> : "–"}</span> {label}: <strong className="font-medium text-ink">{ok ? "found" : "not found"}</strong>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Interview process</h2>
        {r.interview_stages?.length ? (
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            {r.interview_stages.map((s, i) => (
              <li key={i}>
                <strong>{s.name}</strong>
                {s.description && ` — ${s.description}`}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-muted">No published interview process was found, so the questions follow the posting alone.</p>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Why these question categories</h2>
        <ul className="mt-1 space-y-1 text-sm text-ink-soft">
          {(kit.question_plan ?? []).map((p) => (
            <li key={p.category}>
              <strong>{CATEGORY_LABELS[p.category]}</strong> ({p.count}): {p.reason}
            </li>
          ))}
        </ul>
        {kit.coverage.log?.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            {kit.coverage.log.map((c) => (
              <li key={c.check}>
                Coverage check {c.check}: {c.uncovered_requirement_ids.length ? `${c.uncovered_requirement_ids.length} uncovered (${c.uncovered_requirement_ids.join(", ")})` : "every requirement covered"}
                {c.added ? `, gap pass added ${c.added}` : ""}
                {c.fallbacks ? `, fallback for ${c.fallbacks.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Pages tried</h2>
        <ul className="mt-1 space-y-1 text-sm">
          {(r.pages_tried ?? []).map((p) => (
            <li key={p.url} className="flex gap-2">
              <span className={`shrink-0 rounded px-1.5 text-xs leading-5 ${p.status === "used" ? "bg-accent-tint text-accent" : "bg-sunken text-muted"}`}>{p.status === "used" ? p.kind : "skipped"}</span>
              <span className="min-w-0 truncate">
                {p.url}
                {p.reason && <span className="text-muted"> — {p.reason}</span>}
              </span>
            </li>
          ))}
        </ul>
        {r.discussion_sources?.length > 0 && (
          <>
            <h3 className="mt-3 text-sm font-semibold">Public discussion</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {r.discussion_sources.map((s) => (
                <li key={s.url} className="truncate">
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                    {s.title}
                  </a>{" "}
                  <span className="text-xs text-muted">({s.provider})</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
