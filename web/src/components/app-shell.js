"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "@/components/session";
import { Avatar } from "@/components/avatar";
import { Brand } from "@/components/brand";
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
      <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-rule bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="sidebar" className="rounded-md p-1.5 text-ink-soft hover:bg-sunken">
          <IconMenu className="h-5 w-5" />
        </button>
        <Brand href="/kits" />
      </div>
      {open && <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-rule bg-surface/80 backdrop-blur transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-6 pt-6">
          <Brand href="/kits" />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-md p-1.5 text-muted hover:bg-sunken lg:hidden">
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
        <div className="border-t border-rule px-3 py-4">
          <Suspense fallback={<ProfileLink user={session.user} onNavigate={() => setOpen(false)} />}>
            <ProfileLinkActive user={session.user} onNavigate={() => setOpen(false)} />
          </Suspense>
          <button type="button" onClick={session.signOut} className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-soft transition-colors hover:bg-hover hover:text-ink">
            <IconLogOut /> Sign out
          </button>
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1 px-5 pb-16 pt-20 sm:px-8 lg:px-12 lg:pt-12">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

// Current page: a dark ink row; hover: a clearly darker warm fill.
const linkClass = (active) =>
  `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors ${
    active ? "bg-ink font-medium text-paper" : "text-ink-soft hover:bg-hover hover:text-ink"
  }`;

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
          <p className="eyebrow mt-7 px-2.5">This kit</p>
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
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium transition-colors ${practising ? "bg-accent text-surface" : "text-accent hover:bg-accent hover:text-surface"}`}
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

// The signed-in user at the bottom of the sidebar; opens the profile page.
function ProfileLink({ user, onNavigate, active = false }) {
  return (
    <Link href="/profile" onClick={onNavigate} aria-current={active ? "page" : undefined} className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors ${active ? "bg-hover-strong" : "hover:bg-hover"}`}>
      <Avatar user={user} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{user.name || user.email}</span>
        <span className="block truncate text-xs text-muted">{user.jobTitle || (user.name ? user.email : "Your profile")}</span>
      </span>
    </Link>
  );
}

function ProfileLinkActive(props) {
  const pathname = usePathname();
  return <ProfileLink {...props} active={pathname === "/profile"} />;
}
