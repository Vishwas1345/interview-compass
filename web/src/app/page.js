import { HomeActions } from "@/components/home-actions";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl py-8 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Walk into the interview prepared.</h1>
      <p className="mt-4 text-lg text-zinc-600">
        Paste a job description, add the company website and the days you have. InterviewCompass reads the posting, researches the
        company and its hiring process, and builds a prep kit you can edit and practise: questions for every requirement, flashcards
        and a day-by-day plan.
      </p>
      <ul className="mt-6 space-y-2 text-sm text-zinc-700">
        <li>• Every requirement comes word for word from the posting. Nothing is invented.</li>
        <li>• Rewrite or pin any question; regenerating never overwrites your work.</li>
        <li>• Practise one card at a time, weakest first, with an answer coach.</li>
      </ul>
      <HomeActions />
    </div>
  );
}
