import { IconCheck } from "@/components/icons";
import { CATEGORY_LABELS } from "@/components/builder/questions-tab";

// What the pipeline found, and why the kit looks the way it does.
export function ResearchTab({ ctx }) {
  const { kit } = ctx;
  const r = kit.research ?? {};
  const found = [
    ["About page", r.about_page_found],
    ["Hiring or interview page", r.hiring_page_found],
    ["Public interview discussion", r.discussion_found],
  ];
  const pages = r.pages_tried ?? [];
  const used = pages.filter((p) => p.status === "used");

  return (
    <div className="space-y-12">
      <div className="grid border-y border-rule sm:grid-cols-3">
        {found.map(([label, ok], i) => (
          <div key={label} className={`flex items-center gap-3 py-4 ${i > 0 ? "sm:border-l sm:border-rule sm:pl-5" : ""}`}>
            <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${ok ? "bg-accent text-surface" : "border border-rule-strong text-faint"}`}>
              {ok ? <IconCheck className="h-3.5 w-3.5" /> : "–"}
            </span>
            <span>
              <span className="block text-sm text-ink">{label}</span>
              <span className={`block text-xs ${ok ? "text-accent" : "text-muted"}`}>{ok ? "Found" : "Not found"}</span>
            </span>
          </div>
        ))}
      </div>

      {r.notes?.length > 0 && (
        <Block title="Notes">
          <ul className="space-y-2">
            {r.notes.map((n) => (
              <li key={n} className="border-l-2 border-rule pl-3 text-sm leading-relaxed text-ink-soft">
                {n}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Why these question categories">
        <ul className="border-t border-rule">
          {(kit.question_plan ?? []).map((p) => (
            <li key={p.category} className="grid gap-1 border-b border-rule py-3 sm:grid-cols-[10rem_3rem_1fr]">
              <span className="text-sm text-ink">{CATEGORY_LABELS[p.category]}</span>
              <span className="font-mono text-xs text-faint sm:pt-0.5">{p.count}</span>
              <span className="text-sm text-muted">{p.reason}</span>
            </li>
          ))}
        </ul>
        {kit.coverage.log?.length > 0 && (
          <ol className="mt-4 space-y-1 font-mono text-xs text-muted">
            {kit.coverage.log.map((c) => (
              <li key={c.check}>
                Check {c.check}:{" "}
                {c.uncovered_requirement_ids.length ? `${c.uncovered_requirement_ids.length} uncovered (${c.uncovered_requirement_ids.join(", ")})` : "every requirement covered"}
                {c.added ? `, gap pass added ${c.added}` : ""}
                {c.fallbacks ? `, fallback for ${c.fallbacks.join(", ")}` : ""}
              </li>
            ))}
          </ol>
        )}
      </Block>

      <Block title={`Pages read · ${used.length} of ${pages.length}`}>
        <ul className="border-t border-rule">
          {pages.map((p) => (
            <li key={p.url} className="flex items-baseline gap-3 border-b border-rule py-2.5 text-sm">
              <span className={`eyebrow w-16 shrink-0 ${p.status === "used" ? "text-accent" : ""}`}>{p.status === "used" ? p.kind : "Skipped"}</span>
              <span className="min-w-0">
                <span className={`block truncate ${p.status === "used" ? "text-ink-soft" : "text-muted"}`}>{p.url}</span>
                {p.reason && <span className="block text-xs text-muted">{p.reason}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      {r.discussion_sources?.length > 0 && (
        <Block title="Public discussion">
          <ul className="space-y-2">
            {r.discussion_sources.map((s) => (
              <li key={s.url} className="flex items-baseline gap-3 text-sm">
                <span className="eyebrow w-16 shrink-0">{s.provider === "hacker-news" ? "HN" : s.provider}</span>
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate text-ink-soft underline decoration-rule-strong underline-offset-4 hover:text-accent hover:decoration-accent">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

function Block({ title, children }) {
  return (
    <section>
      <h3 className="font-display text-xl text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}
