"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { IconChevronDown } from "@/components/icons";
import { CATEGORY_LABELS } from "@/components/builder/questions-tab";

const KIND = { technical: "Technical", behavioural: "Behavioural", domain: "Domain" };

export function CoverageTab({ ctx }) {
  const { kit, pendingDeletes } = ctx;
  const questions = kit.questions.filter((q) => !pendingDeletes.has(q.id));
  const requirements = kit.role.requirements;

  if (requirements.length === 0) {
    return (
      <p className="max-w-2xl border-l-2 border-rule pl-4 text-[15px] leading-relaxed text-ink-soft">
        No requirements could be found in this posting, so the questions are general to the role and the company. Nothing was invented to fill
        the gap.
      </p>
    );
  }

  const coveredBy = (r) => questions.filter((q) => q.requirement_ids.includes(r.id));
  const musts = requirements.filter((r) => r.priority === "must");
  const nice = requirements.filter((r) => r.priority !== "must");
  const coveredMusts = musts.filter((r) => coveredBy(r).length > 0).length;

  return (
    <div>
      <CoverageStrip requirements={requirements} coveredBy={coveredBy} coveredMusts={coveredMusts} mustCount={musts.length} passes={kit.coverage.passes} />
      <RequirementGroup title="Must-have" requirements={musts} coveredBy={coveredBy} ctx={ctx} />
      {nice.length > 0 && <RequirementGroup title="Nice to have" requirements={nice} coveredBy={coveredBy} ctx={ctx} />}
    </div>
  );
}

// One mark per requirement: filled when a question covers it; must-haves first.
function CoverageStrip({ requirements, coveredBy, coveredMusts, mustCount, passes }) {
  const ordered = [...requirements].sort((a, b) => (a.priority === "must" ? 0 : 1) - (b.priority === "must" ? 0 : 1));
  const all = coveredMusts === mustCount;
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
      <div>
        <p className="font-display text-[44px] leading-none text-ink">
          {coveredMusts}
          <span className="text-faint">/{mustCount}</span>
        </p>
        <p className={`mt-2 text-sm ${all ? "text-ink-soft" : "text-warn"}`}>
          {all ? "Every must-have has at least one question." : `${mustCount - coveredMusts} must-have${mustCount - coveredMusts === 1 ? "" : "s"} without a question.`}
          {passes > 1 && ` Generation needed ${passes} coverage checks.`}
        </p>
      </div>
      <div className="max-w-md" aria-hidden="true">
        <div className="flex flex-wrap gap-1">
          {ordered.map((r) => {
            const covered = coveredBy(r).length > 0;
            const must = r.priority === "must";
            return (
              <span
                key={r.id}
                title={`${r.text}: ${covered ? "covered" : "no question"}`}
                className={`h-6 w-2.5 rounded-sm ${covered ? (must ? "bg-accent" : "bg-accent/40") : must ? "bg-warn" : "bg-rule-strong"}`}
              />
            );
          })}
        </div>
        <p className="mt-2 flex gap-4 text-[11px] text-muted">
          <Legend className="bg-accent" label="Must, covered" />
          <Legend className="bg-accent/40" label="Nice, covered" />
          <Legend className="bg-warn" label="Gap" />
        </p>
      </div>
    </div>
  );
}

function Legend({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-1.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

function RequirementGroup({ title, requirements, coveredBy, ctx }) {
  return (
    <section className="mt-10" aria-labelledby={`req-${title}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`req-${title}`} className="font-display text-xl text-ink">
          {title} <span className="font-sans text-sm text-faint">{requirements.length}</span>
        </h3>
        <span className="eyebrow hidden sm:block">Questions</span>
      </div>
      <ul className="mt-3 border-t border-rule">
        {requirements.map((r) => (
          <RequirementRow key={r.id} requirement={r} covering={coveredBy(r)} ctx={ctx} />
        ))}
      </ul>
    </section>
  );
}

function RequirementRow({ requirement: r, covering, ctx }) {
  const { doc, selectTab, setAddFor, regenerate } = ctx;
  const [open, setOpen] = useState(false);
  const gap = covering.length === 0;
  const category = r.kind === "behavioural" ? "behavioural" : "technical";
  const goTo = (id) => {
    selectTab("questions");
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  };

  return (
    <li className={`border-b border-rule py-4 ${gap && r.priority === "must" ? "-ml-4 border-l-[3px] border-l-warn pl-[13px]" : ""}`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="text-[15px] leading-snug text-ink">{r.text}</p>
          {r.source_quote && r.source_quote !== r.text && (
            <p className="mt-1.5 font-display text-[15px] italic leading-snug text-muted">“{r.source_quote}”</p>
          )}
          <p className="eyebrow mt-2">{KIND[r.kind]}</p>
        </div>
        <div className="sm:text-right">
          {gap ? (
            <p className="text-sm font-medium text-warn">No question</p>
          ) : (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-soft transition-colors hover:bg-hover hover:text-ink sm:-mr-2">
              <span aria-hidden="true" className="flex gap-[3px]">
                {covering.slice(0, 5).map((q) => (
                  <span key={q.id} className="h-1.5 w-1.5 rounded-full bg-accent" />
                ))}
              </span>
              {covering.length} question{covering.length === 1 ? "" : "s"}
              <IconChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      </div>
      {open && (
        <ol className="mt-3 space-y-1 border-l border-rule pl-4">
          {covering.map((q) => (
            <li key={q.id}>
              <button type="button" onClick={() => goTo(q.id)} className="w-full rounded px-2 py-1 text-left text-sm text-ink-soft transition-colors hover:bg-hover hover:text-ink">
                <span className="eyebrow mr-2">{CATEGORY_LABELS[q.category]}</span>
                {q.prompt}
              </button>
            </li>
          ))}
        </ol>
      )}
      {gap && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => (setAddFor({ category, requirementId: r.id }), selectTab("questions"))}>
            Add a question
          </Button>
          <Button size="sm" variant="secondary" disabled={Boolean(doc.regenerating)} onClick={() => regenerate({ target: "category", category })}>
            Regenerate {CATEGORY_LABELS[category].toLowerCase()}
          </Button>
        </div>
      )}
    </li>
  );
}
