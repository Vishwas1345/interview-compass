"use client";

import { useMemo, useState } from "react";
import { findQuoteRanges, splitByRanges } from "@interview-compass/shared";

const KIND = { technical: "Technical", behavioural: "Behavioural", domain: "Domain" };

// The original posting, with every requirement highlighted where it was quoted
// from: see how the posting was read, and learn what it really asks for.
export function PostingTab({ ctx }) {
  const { doc, kit } = ctx;
  const jd = doc.input?.jd ?? "";
  const requirements = kit.role.requirements;
  const byId = useMemo(() => new Map(requirements.map((r) => [r.id, r])), [requirements]);
  const pieces = useMemo(
    () => splitByRanges(jd, findQuoteRanges(jd, requirements.map((r) => ({ id: r.id, quote: r.source_quote ?? r.text })))),
    [jd, requirements],
  );
  const [focus, setFocus] = useState(null); // requirement id being pointed at
  const musts = requirements.filter((r) => r.priority === "must").length;

  function point(id) {
    setFocus(id);
    document.querySelector(`[data-req~="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-rule pb-5">
          <Meta label="Role" value={kit.role.title || "Not named in the posting"} muted={!kit.role.title} />
          {kit.role.seniority && <Meta label="Seniority" value={kit.role.seniority} />}
          {kit.source.location && <Meta label="Location" value={kit.source.location} />}
          <Meta label="Length" value={`${jd.length.toLocaleString()} characters`} />
        </div>
        <p className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm border-b-2 border-accent bg-accent-tint" /> Must-have ({musts})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm border-b-2 border-dashed border-faint bg-sunken" /> Nice to have ({requirements.length - musts})
          </span>
          <span>Hover a highlight to see the requirement it became.</span>
        </p>
        <div className="mt-6 whitespace-pre-wrap text-[15px] leading-[1.85] text-ink-soft">
          {pieces.map((piece, i) => {
            if (piece.ids.length === 0) return <span key={i}>{piece.text}</span>;
            const reqs = piece.ids.map((id) => byId.get(id)).filter(Boolean);
            const must = reqs.some((r) => r.priority === "must");
            const active = piece.ids.includes(focus);
            return (
              <mark
                key={i}
                data-req={piece.ids.join(" ")}
                title={reqs.map((r) => `${r.text} · ${r.priority === "must" ? "must-have" : "nice to have"} · ${KIND[r.kind]}`).join("\n")}
                onMouseEnter={() => setFocus(piece.ids[0])}
                onMouseLeave={() => setFocus(null)}
                className={`rounded-[3px] px-0.5 text-ink transition-colors [box-decoration-break:clone] ${
                  must ? "border-b-2 border-accent bg-accent-tint" : "border-b-2 border-dashed border-faint bg-sunken"
                } ${active ? "bg-accent text-surface" : ""}`}
              >
                {piece.text}
              </mark>
            );
          })}
        </div>
      </div>

      <aside className="space-y-10 lg:sticky lg:top-8 lg:self-start">
        <section aria-labelledby="reqs">
          <h3 id="reqs" className="eyebrow">
            What it asks for · {requirements.length}
          </h3>
          {requirements.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No requirements could be found in this posting.</p>
          ) : (
            <ol className="mt-3 space-y-0.5">
              {requirements.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => point(r.id)}
                    onMouseEnter={() => setFocus(r.id)}
                    onMouseLeave={() => setFocus(null)}
                    className={`flex w-full gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${focus === r.id ? "bg-hover text-ink" : "text-ink-soft hover:bg-hover"}`}
                  >
                    <span className="mt-px w-5 shrink-0 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <span className="block leading-snug">{r.text}</span>
                      <span className={`eyebrow ${r.priority === "must" ? "text-accent" : ""}`}>
                        {r.priority === "must" ? "Must" : "Nice"} · {KIND[r.kind]}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
        {kit.role.responsibilities?.length > 0 && (
          <section aria-labelledby="resp">
            <h3 id="resp" className="eyebrow">
              What you will do
            </h3>
            <ul className="mt-3 space-y-2">
              {kit.role.responsibilities.map((x) => (
                <li key={x} className="border-l-2 border-rule pl-3 text-sm leading-snug text-ink-soft">
                  {x}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function Meta({ label, value, muted = false }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 text-[15px] capitalize ${muted ? "normal-case text-muted" : "text-ink"}`}>{value}</p>
    </div>
  );
}
