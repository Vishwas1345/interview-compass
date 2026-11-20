"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "@/components/session";
import { AppHeader } from "@/components/app-header";
import {
  IconBuilding, IconCalendar, IconCards, IconClose, IconKits, IconLogOut, IconMenu, IconPlay, IconPlus, IconQuestions, IconSearch, IconTarget,
} from "@/components/icons";

// The kit's sections; the builder reads ?tab= (kit-builder.js).
export const KIT_SECTIONS = [
  { id: "questions", label: "Questions", Icon: IconQuestions },
  { id: "coverage", label: "Coverage", Icon: IconTarget },
  { id: "flashcards", label: "Flashcards", Icon: IconCards },
  { id: "schedule", label: "Schedule", Icon: IconCalendar },
  { id: "brief", label: "Company brief", Icon: IconBuilding },
  { id: "research", label: "Research", Icon: IconSearch },
];

// Signed in: a left sidebar (a drawer on phones). Signed out: the simple top header.
export function AppShell({ children }) {
  const session = useSession();
  const [open, setOpen] = useState(false);

  // While the session loads, no chrome at all: avoids flashing the signed-out header
  // before the sidebar appears.
  if (session.status === "loading") {
    return (
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:py-8">
        {children}
      </main>
    );
  }
  if (session.status !== "signedIn") {
    return (
      <>
        <AppHeader />
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">
          {children}
        </main>
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-1">
      {/* Phone top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="sidebar" className="rounded-md p-1.5 text-zinc-700 hover:bg-zinc-100">
          <IconMenu className="h-5 w-5" />
        </button>
        <Brand />
      </div>
      {open && <div className="fixed inset-0 z-40 bg-zinc-900/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Brand />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 lg:hidden">
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          {/* Reading the URL here must sit inside Suspense: this component is in the root
              layout, and cacheComponents prerenders every route through it. */}
          <Suspense fallback={<StaticNav />}>
            <SidebarNav onNavigate={() => setOpen(false)} />
          </Suspense>
        </nav>
        <div className="border-t border-zinc-200 px-3 py-3">
          <p className="truncate px-2 text-xs text-zinc-500" title={session.user.email}>
            {session.user.email}
          </p>
          <button type="button" onClick={session.signOut} className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100">
            <IconLogOut /> Sign out
          </button>
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1 px-4 pb-10 pt-16 sm:px-6 lg:px-10 lg:pt-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/kits" className="flex items-center gap-2 font-semibold text-zinc-900">
      <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
        IC
      </span>
      InterviewCompass
    </Link>
  );
}

const linkClass = (active) =>
  `flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${active ? "bg-indigo-50 font-medium text-indigo-800" : "text-zinc-700 hover:bg-zinc-100"}`;

function StaticNav() {
  return (
    <ul className="space-y-0.5">
      <li>
        <Link href="/kits" className={linkClass(false)}>
          <IconKits /> My kits
        </Link>
      </li>
      <li>
        <Link href="/kits/new" className={linkClass(false)}>
          <IconPlus /> New kit
        </Link>
      </li>
    </ul>
  );
}

function SidebarNav({ onNavigate }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const match = /^\/kits\/([a-f0-9]{24})(\/practice)?$/.exec(pathname);
  const kitId = match?.[1];
  const practising = Boolean(match?.[2]);
  const tab = params.get("tab") ?? (params.get("setDays") ? "schedule" : "questions");

  return (
    <>
      <ul className="space-y-0.5">
        <li>
          <Link href="/kits" onClick={onNavigate} aria-current={pathname === "/kits" ? "page" : undefined} className={linkClass(pathname === "/kits")}>
            <IconKits /> My kits
          </Link>
        </li>
        <li>
          <Link href="/kits/new" onClick={onNavigate} aria-current={pathname === "/kits/new" ? "page" : undefined} className={linkClass(pathname === "/kits/new")}>
            <IconPlus /> New kit
          </Link>
        </li>
      </ul>
      {kitId && (
        <>
          <p className="mt-6 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">This kit</p>
          <ul className="mt-1 space-y-0.5">
            {KIT_SECTIONS.map(({ id, label, Icon }) => {
              const active = !practising && tab === id;
              return (
                <li key={id}>
                  <Link href={`/kits/${kitId}?tab=${id}`} scroll={false} onClick={onNavigate} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                    <Icon /> {label}
                  </Link>
                </li>
              );
            })}
            <li className="pt-2">
              <Link
                href={`/kits/${kitId}/practice`}
                onClick={onNavigate}
                aria-current={practising ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium ${practising ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100"}`}
              >
                <IconPlay /> Practise
              </Link>
            </li>
          </ul>
        </>
      )}
    </>
  );
}
