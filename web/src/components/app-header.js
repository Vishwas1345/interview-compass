"use client";

import Link from "next/link";
import { useSession } from "@/components/session";
import { Button, buttonClass } from "@/components/ui";

export function AppHeader() {
  const session = useSession();
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href={session.status === "signedIn" ? "/kits" : "/"} className="flex items-center gap-2 font-semibold text-zinc-900">
          <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-indigo-600 text-sm text-white">
            IC
          </span>
          InterviewCompass
        </Link>
        {session.status === "signedIn" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-zinc-600 sm:inline">{session.user.email}</span>
            <Button variant="ghost" size="sm" onClick={session.signOut}>
              Sign out
            </Button>
          </div>
        )}
        {session.status === "signedOut" && (
          <Link href="/login" className={buttonClass("ghost", "sm")}>
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
