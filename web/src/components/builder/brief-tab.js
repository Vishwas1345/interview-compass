"use client";

import { Button } from "@/components/ui";
import { IconPin, IconRefresh } from "@/components/icons";
import { InlineEdit } from "@/components/builder/inline-edit";
import { ItemState } from "@/components/builder/item-state";

// The brief reads like a short article: a lead, a body, the interview process and
// numbered sources. Both text fields stay editable and pinnable (D8).
export function BriefTab({ ctx }) {
  const { kit, doc, act, regenerate } = ctx;
  const brief = kit.company_brief;
  const states = brief.field_state ?? {};
  const stages = kit.research?.interview_stages ?? [];

  const field = (name, label, textClassName) => {
    const state = states[name] ?? "generated";
    const pinned = state === "pinned";
    return (
      <div>
        <div className="flex items-center gap-3">
          <span className="eyebrow">{label}</span>
          <ItemState state={state} />
          <button
            type="button"
            aria-pressed={pinned}
            onClick={() => act({ type: "setPinned", target: "brief", field: name, pinned: !pinned })}
            className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-hover ${pinned ? "text-accent" : "text-muted hover:text-ink"}`}
          >
            <IconPin className="h-3.5 w-3.5" /> {pinned ? "Unpin" : "Pin"}
          </button>
        </div>
        <InlineEdit label={label} value={brief[name]} onSave={(value) => act({ type: "updateBrief", fields: { [name]: value } })} className="-mx-2 mt-1" textClassName={textClassName} />
      </div>
    );
  };

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_17rem]">
      <article className="min-w-0 max-w-2xl space-y-8">
        {field("what_they_do", "What they do", "font-display text-[24px] leading-snug text-ink")}
        {field("summary", "Summary", "text-[15.5px] leading-[1.75] text-ink-soft")}
        <p className="border-t border-rule pt-4 text-xs text-muted">Written only from the company pages listed here, never from general knowledge.</p>
      </article>

      <aside className="space-y-10">
        <Button size="sm" variant="secondary" disabled={Boolean(doc.regenerating)} onClick={() => regenerate({ target: "brief" })}>
          <IconRefresh /> Regenerate brief
        </Button>

        <section aria-labelledby="process">
          <h3 id="process" className="eyebrow">
            Interview process
          </h3>
          {stages.length > 0 ? (
            <ol className="mt-3 border-l border-rule">
              {stages.map((s, i) => (
                <li key={i} className="relative pb-4 pl-5 last:pb-0">
                  <span aria-hidden="true" className="absolute -left-[5px] top-1.5 h-[9px] w-[9px] rounded-full border-2 border-paper bg-accent" />
                  <p className="text-sm font-medium text-ink">{s.name}</p>
                  {s.description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.description}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted">No published interview process was found.</p>
          )}
        </section>

        <section aria-labelledby="sources">
          <h3 id="sources" className="eyebrow">
            Sources
          </h3>
          {brief.sources.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No company pages could be read.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {brief.sources.map((url, i) => {
                const { host, path } = splitUrl(url);
                return (
                  <li key={url} className="flex gap-2 text-sm">
                    <span className="mt-px font-mono text-[11px] text-faint">{i + 1}</span>
                    <a href={url} target="_blank" rel="noreferrer noopener" className="min-w-0 rounded text-ink-soft underline decoration-rule-strong underline-offset-4 transition-colors hover:text-accent hover:decoration-accent">
                      <span className="block truncate">{host}</span>
                      {path && <span className="block truncate text-xs text-muted">{path}</span>}
                    </a>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}

function splitUrl(url) {
  try {
    const u = new URL(url);
    return { host: u.host.replace(/^www\./, ""), path: u.pathname === "/" ? "" : decodeURI(u.pathname) };
  } catch {
    return { host: url, path: "" };
  }
}
