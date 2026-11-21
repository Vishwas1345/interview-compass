export const metadata = { title: "Privacy · InterviewCompass" };

// A plain account of what the app stores and who else sees it. Google requires a
// privacy policy link before an app using Google sign-in can be published (D22).
const SECTIONS = [
  {
    title: "What we store",
    items: [
      "Your account: your email, and either a scrypt hash of your password (never the password itself) or, if you sign in with Google, your Google account id.",
      "Your profile, if you fill it in: name, job title, phone, location, links, a short bio, a photo and a résumé.",
      "Your kits: the job descriptions and company websites you enter, what the app generated, your edits and your practice history.",
      "A session cookie that keeps you signed in for up to 7 days. We store only a hash of it. No advertising or tracking cookies, and no analytics.",
    ],
  },
  {
    title: "Google sign-in",
    items: [
      "If you choose Continue with Google, Google tells us your name, your email address, whether Google has verified that email, your profile photo and an account id. We ask for nothing else: not your contacts, mail, files or calendar.",
      "We use this only to sign you in and, the first time, to fill in your name and photo if your profile has none. The photo is copied into the app; you can replace or remove it on your profile. We do not share any of it.",
    ],
  },
  {
    title: "Who else sees what",
    items: [
      "To build a kit, the job description, text from the company's public web pages and, when you use the answer coach, the answer you type are sent to the AI model provider (Groq). Your profile, photo and résumé are never sent to it.",
      "To find public interview discussion, the company's name is sent as a search to Tavily and to Hacker News search.",
      "The app runs on Render, and its database is MongoDB Atlas; both hold the data above on our behalf.",
      "We do not sell or share your data with anyone else.",
    ],
  },
  {
    title: "Your choices",
    items: [
      "You can edit or delete your profile, photo, résumé and kits at any time.",
      "Deleting your account (Profile → Delete account) removes your account, every kit, your practice history and your files at once. It cannot be undone.",
      "Questions: write to the support email shown on Google's sign-in screen for this app.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl pb-12 pt-6">
      <p className="eyebrow">Privacy</p>
      <h1 className="mt-3 font-display text-[40px] leading-tight text-ink">What happens to your data</h1>
      <p className="mt-3 text-sm text-muted">Last updated 21 November 2026.</p>
      {SECTIONS.map((section) => (
        <section key={section.title} className="mt-8">
          <h2 className="font-display text-2xl text-ink">{section.title}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink-soft">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
