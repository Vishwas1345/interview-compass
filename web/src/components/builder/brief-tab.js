"use client";

import { Button, Card } from "@/components/ui";
import { InlineEdit } from "@/components/builder/inline-edit";
import { ItemState } from "@/components/builder/item-state";

const FIELDS = [
  { field: "summary", label: "Summary" },
  { field: "what_they_do", label: "What they do" },
];

export function BriefTab({ ctx }) {
  const { kit, doc, act, regenerate } = ctx;
  const brief = kit.company_brief;
  const states = brief.field_state ?? {};
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Written only from the company pages listed below, never from general knowledge.</p>
        <Button size="sm" variant="secondary" disabled={Boolean(doc.regenerating)} onClick={() => regenerate({ target: "brief" })}>
          Regenerate brief
        </Button>
      </div>
      {FIELDS.map(({ field, label }) => {
        const state = states[field] ?? "generated";
        const pinned = state === "pinned";
        return (
          <Card key={field} className="p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{label}</h2>
              <ItemState state={state} />
              <Button size="sm" variant="ghost" className="ml-auto" aria-pressed={pinned} onClick={() => act({ type: "setPinned", target: "brief", field, pinned: !pinned })}>
                {pinned ? "Unpin" : "Pin"}
              </Button>
            </div>
            <InlineEdit label={label} value={brief[field]} onSave={(value) => act({ type: "updateBrief", fields: { [field]: value } })} className="mt-1" textClassName="text-sm text-ink-soft" />
          </Card>
        );
      })}
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Sources</h2>
        {brief.sources.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No company pages could be read.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {brief.sources.map((url) => (
              <li key={url} className="truncate">
                <a href={url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
