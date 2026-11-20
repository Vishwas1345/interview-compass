"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { get } from "@/lib/api";

const POLL_MS = 2000;

// Loads one kit and keeps polling while the server is working on it (generation or
// a regeneration), D12. Polling stops by itself when the page is hidden: Next keeps
// left pages mounted but cleans up their effects (cacheComponents Activity).
export function useKit(id) {
  const [kit, setKit] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await get(`/kits/${id}`);
      setKit(data.kit);
      setError(null);
      return data.kit;
    } catch (e) {
      setError(e);
      return null;
    }
  }, [id]);

  const busy = kit && (kit.status === "generating" || Boolean(kit.regenerating));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the initial fetch for this kit
    if (!kit) load();
  }, [kit, load]);
  useEffect(() => {
    if (!busy) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [busy, load]);

  return { kit, setKit, error, reload: load };
}
