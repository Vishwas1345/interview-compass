import { HomeActions } from "@/components/home-actions";

const STEPS = [
  {
    title: "Paste the posting",
    text: "Add the company website and the days you have. Requirements are taken word for word from the posting; nothing is invented.",
  },
  {
    title: "We research and build",
    text: "The company site and its hiring page, public interview discussion, then questions per category until every must-have is covered.",
  },
  {
    title: "Shape it and practise",
    text: "Rewrite or pin anything; regenerating never overwrites your work. Practise weakest-first, with an answer coach.",
  },
];

export default function Home() {
  return (
    <div className="py-6 sm:py-12">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800">AI interview prep, grounded in the posting</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">Walk into the interview prepared.</h1>
          <p className="mt-4 text-lg text-zinc-600">
            InterviewCompass turns a job description into a prep kit: a company brief, questions for every requirement, flashcards and a day-by-day plan you
            can edit and practise.
          </p>
          <HomeActions />
        </div>
        <KitPreview />
      </div>

      <ol className="mt-16 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="rounded-lg border border-zinc-200 bg-white p-5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-sm font-semibold text-white">{i + 1}</span>
            <h2 className="mt-3 font-semibold text-zinc-900">{step.title}</h2>
            <p className="mt-1 text-sm text-zinc-600">{step.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// A static picture of a kit, so a visitor sees what they will get.
function KitPreview() {
  const stats = [
    ["Requirements", "9"],
    ["Must-haves covered", "6/6"],
    ["Questions", "18"],
  ];
  const questions = [
    { edge: "border-l-indigo-500", state: "edited", stateClass: "bg-sky-100 text-sky-800", text: "How would you partition high-frequency telemetry in PostgreSQL?", tag: "PostgreSQL" },
    { edge: "border-l-violet-500", state: "pinned", stateClass: "bg-amber-100 text-amber-900", text: "Design an ingestion API for 10k samples per second.", tag: "REST APIs" },
    { edge: "border-l-emerald-500", state: "generated", stateClass: "bg-zinc-100 text-zinc-600", text: "Tell me about a time you mentored another engineer.", tag: "Mentoring" },
  ];
  return (
    <div aria-hidden="true" className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xl shadow-indigo-100/60">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-zinc-900">Senior Backend Engineer</p>
          <p className="text-xs text-zinc-500">Acme Rockets · 5 days</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">Ready</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1.5">
            <p className="text-[10px] text-zinc-500">{label}</p>
            <p className="text-sm font-semibold text-zinc-900">{value}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {questions.map((q) => (
          <li key={q.text} className={`rounded-md border border-l-4 border-zinc-200 px-3 py-2 ${q.edge}`}>
            <p className="text-sm font-medium text-zinc-900">{q.text}</p>
            <div className="mt-1 flex gap-1.5 text-[10px]">
              <span className={`rounded px-1.5 py-0.5 font-medium uppercase ${q.stateClass}`}>{q.state}</span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-800">{q.tag}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
