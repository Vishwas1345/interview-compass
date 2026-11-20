import { Card } from "@/components/ui";
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
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700">
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
              <span aria-hidden="true">{ok ? "✓" : "–"}</span> {label}: <strong>{ok ? "found" : "not found"}</strong>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Interview process</h2>
        {r.interview_stages?.length ? (
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
            {r.interview_stages.map((s, i) => (
              <li key={i}>
                <strong>{s.name}</strong>
                {s.description && ` — ${s.description}`}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-zinc-600">No published interview process was found, so the questions follow the posting alone.</p>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Why these question categories</h2>
        <ul className="mt-1 space-y-1 text-sm text-zinc-700">
          {(kit.question_plan ?? []).map((p) => (
            <li key={p.category}>
              <strong>{CATEGORY_LABELS[p.category]}</strong> ({p.count}): {p.reason}
            </li>
          ))}
        </ul>
        {kit.coverage.log?.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-zinc-600">
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
              <span className={`shrink-0 rounded px-1.5 text-xs leading-5 ${p.status === "used" ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>{p.status === "used" ? p.kind : "skipped"}</span>
              <span className="min-w-0 truncate">
                {p.url}
                {p.reason && <span className="text-zinc-500"> — {p.reason}</span>}
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
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-indigo-700 hover:underline">
                    {s.title}
                  </a>{" "}
                  <span className="text-xs text-zinc-500">({s.provider})</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
