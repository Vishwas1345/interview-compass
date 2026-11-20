"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { get, post, setUnauthenticatedHandler } from "@/lib/api";
import { Spinner } from "@/components/ui";

const SessionContext = createContext(null);

export function useSession() {
  return useContext(SessionContext);
}

export function loginPath(next, { expired = false } = {}) {
  const params = new URLSearchParams();
  if (next && next !== "/" && !next.startsWith("/login") && !next.startsWith("/register")) params.set("next", next);
  if (expired) params.set("expired", "1");
  const query = params.toString();
  return `/login${query ? `?${query}` : ""}`;
}

// Read only in the browser, at the moment of redirecting. (usePathname here would
// block prerendering of every dynamic route under cacheComponents: this provider
// wraps the whole app from the layout.)
function currentPath() {
  return window.location.pathname + window.location.search;
}

// Knows who is signed in. When any API call answers 401, the user is sent to sign
// in with a "your session ended" message and brought back afterwards (app spec).
export function SessionProvider({ children }) {
  const router = useRouter();
  const [state, setState] = useState({ status: "loading", user: null });

  useEffect(() => {
    let cancelled = false;
    get("/auth/me")
      .then(({ user }) => !cancelled && setState({ status: "signedIn", user }))
      .catch(() => !cancelled && setState({ status: "signedOut", user: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler((error) => {
      setState({ status: "signedOut", user: null });
      router.replace(loginPath(currentPath(), { expired: error.code === "SESSION_EXPIRED" }));
    });
  }, [router]);

  const signedIn = useCallback((user) => setState({ status: "signedIn", user }), []);
  // After a profile change: refresh what the sidebar shows, without a reload.
  const updateUser = useCallback((user) => setState((s) => (s.status === "signedIn" ? { ...s, user: { ...s.user, ...user } } : s)), []);
  // After the account is deleted: the server already ended the session.
  const signedOutLocally = useCallback(() => setState({ status: "signedOut", user: null }), []);
  const signOut = useCallback(async () => {
    try {
      await post("/auth/logout");
    } finally {
      setState({ status: "signedOut", user: null });
      router.replace("/login");
    }
  }, [router]);

  const value = useMemo(() => ({ ...state, signedIn, signOut, updateUser, signedOutLocally }), [state, signedIn, signOut, updateUser, signedOutLocally]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// Wraps pages that need an account: waits for the session, sends signed-out users
// to sign in, then back here.
export function RequireAuth({ children, fallback = null }) {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session.status === "signedOut") router.replace(loginPath(currentPath()));
  }, [session.status, router]);
  if (session.status !== "signedIn") return fallback;
  return children;
}

// The free API host sleeps when idle (D9, L3). If the health check is slow, say so
// instead of showing a silent spinner, and keep trying until it answers.
export function WakeBanner() {
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const slow = setTimeout(() => !cancelled && setWaking(true), 2500);
    (async () => {
      for (let attempt = 0; attempt < 40 && !cancelled; attempt += 1) {
        try {
          const response = await fetch("/api/health", { cache: "no-store" });
          if (response.ok) break;
        } catch {
          // still waking
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      clearTimeout(slow);
      if (!cancelled) setWaking(false);
    })();
    return () => {
      cancelled = true;
      clearTimeout(slow);
    };
  }, []);
  if (!waking) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-warn-tint px-4 py-2 text-sm text-warn">
      <Spinner /> Waking the server. This can take up to a minute on the free plan.
    </div>
  );
}
