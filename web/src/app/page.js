import { HomeActions } from "@/components/home-actions";

const STEPS = [
  {
    title: "Paste the posting",
    text: "Add the company website and the days you have. Every requirement is quoted from the posting word for word; nothing is invented.",
  },
  {
    title: "Research, then questions",
    text: "We read the company's site and hiring page, look for public interview discussion, and write questions until every must-have is covered.",
  },
  {
    title: "Make it yours, then practise",
    text: "Rewrite or pin anything; regenerating never overwrites your work. Practise weakest-first, with a coach for your answers.",
  },
];

export default function Home() {
  return (
    <div className="pb-10 pt-6 sm:pt-14">
      <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="eyebrow">Interview preparation</p>
          <h1 className="mt-4 font-display text-[44px] leading-[1.05] text-ink sm:text-[60px]">
            Walk into the interview <span className="italic text-accent">prepared.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-soft">
            InterviewCompass turns a job description into a prep kit you can trust: a company brief from its own pages, questions for every
            requirement, flashcards and a day-by-day plan. Then you edit it, and practise it.
          </p>
          <HomeActions />
        </div>
        <KitSpecimen />
      </div>

      <section aria-labelledby="how" className="mt-24">
        <h2 id="how" className="eyebrow">
          How it works
        </h2>
        <ol className="mt-5 grid gap-10 border-t border-rule pt-8 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="font-mono text-xs text-faint">0{i + 1}</span>
              <h3 className="mt-2 font-display text-[22px] leading-snug text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// A small, faithful picture of a kit page: the same rules, figures and numbered rows.
function KitSpecimen() {
  const figures = [
    ["Requirements", "9"],
    ["Must-haves", "6/6"],
    ["Questions", "18"],
  ];
  const rows = [
    ["01", "How would you partition high-frequency telemetry in PostgreSQL?", "Edited", "PostgreSQL"],
    ["02", "Design an ingestion API for ten thousand samples a second.", "Pinned", "REST APIs"],
    ["03", "Tell me about a time you mentored another engineer.", "AI", "Mentoring"],
  ];
  return (
    <div aria-hidden="true" className="rounded-lg border border-rule bg-surface p-6 shadow-[0_30px_80px_-40px_rgb(28_27_25/0.35)] sm:p-8">
      <p className="eyebrow">Acme Rockets</p>
      <p className="mt-1 font-display text-[28px] leading-tight text-ink">Senior Backend Engineer</p>
      <p className="mt-1 text-xs text-muted">5 days to prepare</p>
      <div className="mt-5 grid grid-cols-3 border-y border-rule">
        {figures.map(([label, value], i) => (
          <div key={label} className={`py-3 ${i > 0 ? "border-l border-rule pl-4" : ""}`}>
            <p className="eyebrow">{label}</p>
            <p className="mt-1 font-display text-2xl leading-none text-ink">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 font-display text-lg text-ink">Technical</p>
      <ol className="mt-2 border-t border-rule">
        {rows.map(([n, text, state, tag]) => (
          <li key={n} className="flex gap-3 border-b border-rule py-3">
            <span className="mt-0.5 font-mono text-[11px] text-faint">{n}</span>
            <div>
              <p className="text-sm leading-snug text-ink">{text}</p>
              <p className="mt-1 flex gap-3 text-[11px] text-muted">
                <span className={`font-semibold uppercase tracking-[0.08em] ${state === "AI" ? "text-faint" : "text-accent"}`}>{state}</span>
                <span>{tag}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
