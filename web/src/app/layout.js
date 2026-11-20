import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { SessionProvider, WakeBanner } from "@/components/session";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Serif for headings only (editorial direction); the UI itself stays in Geist.
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata = {
  title: "InterviewCompass",
  description: "Turn a job description into a personalised interview prep kit.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <SessionProvider>
          <WakeBanner />
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
