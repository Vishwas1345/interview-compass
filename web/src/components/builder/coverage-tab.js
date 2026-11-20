"use client";

import { Button, Card } from "@/components/ui";
import { CATEGORY_LABELS } from "@/components/builder/questions-tab";

const KIND = { technical: "Technical", behavioural: "Behavioural", domain: "Domain" };

export function CoverageTab({ ctx }) {
  const { kit, doc, selectTab, setAddFor, regenerate, pendingDeletes } = ctx;
  const questions = kit.questions.filter((q) => !pendingDeletes.has(q.id));
  const requirements = kit.role.requirements;

  if (requirements.length === 0) {
    return (
      <Card className="p-5 text-sm text-ink-soft">
        No requirements could be found in this posting, so the questions are general to the role and the company. Nothing was invented to fill the gap.
      </Card>
    );
  }

  const musts = requirements.filter((r) => r.priority === "must");
  const coveredMusts = musts.filter((r) => questions.some((q) => q.requirement_ids.includes(r.id))).length;
  return (
    <div>
      <p className="text-sm text-ink-soft">
        {coveredMusts} of {musts.length} must-have requirements have a question. Every requirement below is quoted word for word from the posting.
        {kit.coverage.passes > 1 && ` Generation needed ${kit.coverage.passes} coverage checks to close every gap.`}
      </p>
      <ul className="mt-4 space-y-2">
        {requirements.map((r) => {
          const covering = questions.filter((q) => q.requirement_ids.includes(r.id));
          const gap = covering.length === 0;
          const category = r.kind === "behavioural" ? "behavioural" : "technical";
          return (
            <li key={r.id}>
              <Card className={`p-4 ${gap && r.priority === "must" ? "border-warn/40 bg-warn-tint/40" : ""}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{r.text}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      <span className={r.priority === "must" ? "font-semibold text-accent" : ""}>{r.priority === "must" ? "Must have" : "Nice to have"}</span> · {KIND[r.kind]}
                      {r.source_quote && <> · from the posting: “{r.source_quote}”</>}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${gap ? "bg-warn-tint text-warn" : "bg-accent-tint text-accent"}`}>
                    {gap ? "No question" : `${covering.length} question${covering.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                {covering.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {covering.map((q) => (
                      <li key={q.id} className="truncate">
                        <button type="button" className="text-left text-accent hover:underline" onClick={() => selectTab("questions") || setTimeout(() => document.getElementById(q.id)?.scrollIntoView({ block: "center" }), 50)}>
                          {CATEGORY_LABELS[q.category]}: {q.prompt}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {gap && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => (setAddFor({ category, requirementId: r.id }), selectTab("questions"))}>
                      Add a question
                    </Button>
                    <Button size="sm" variant="secondary" disabled={Boolean(doc.regenerating)} onClick={() => regenerate({ target: "category", category })}>
                      Regenerate {CATEGORY_LABELS[category].toLowerCase()} questions
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
