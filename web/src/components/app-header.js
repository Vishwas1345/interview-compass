"use client";

import Link from "next/link";
import { useSession } from "@/components/session";
import { Button, buttonClass } from "@/components/ui";
import { Brand } from "@/components/brand";

export function AppHeader() {
  const session = useSession();
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
        <Brand href={session.status === "signedIn" ? "/kits" : "/"} />
        {session.status === "signedIn" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted sm:inline">{session.user.email}</span>
            <Button variant="ghost" size="sm" onClick={session.signOut}>
              Sign out
            </Button>
          </div>
        )}
        {session.status === "signedOut" && (
          <nav className="flex items-center gap-1">
            <Link href="/login" className={buttonClass("ghost", "sm")}>
              Sign in
            </Link>
            <Link href="/register" className={buttonClass("secondary", "sm")}>
              Create account
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
