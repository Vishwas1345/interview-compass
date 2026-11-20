import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider, WakeBanner } from "@/components/session";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "InterviewCompass",
  description: "Turn a job description into a personalised interview prep kit.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <SessionProvider>
          <WakeBanner />
          <AppHeader />
          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
            {children}
          </main>
        </SessionProvider>
      </body>
    </html>
  );
}
