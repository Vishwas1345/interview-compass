"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { get, post } from "@/lib/api";
import { localApply } from "@/lib/local-ops";

const POLL_MS = 2000;

// Loads one kit, keeps polling while the server works on it (generation or a
// regeneration, D12), and runs builder operations (D13):
// - operations queue, so each one is sent with the version the previous one produced;
// - the screen updates at once (localApply) and is rolled back if the save fails;
// - a VERSION_CONFLICT (another tab saved first) loads the latest kit instead.
// Polling stops by itself when the page is hidden: Next keeps left pages mounted but
// cleans up their effects (cacheComponents Activity).
export function useKit(id) {
  const [kit, setKit] = useState(null);
  const [error, setError] = useState(null);
  const kitRef = useRef(null);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    kitRef.current = kit;
  }, [kit]);

  const load = useCallback(async () => {
    try {
      const data = await get(`/kits/${id}`);
      kitRef.current = data.kit;
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
    let cancelled = false;
    get(`/kits/${id}`)
      .then((data) => {
        if (cancelled) return;
        kitRef.current = data.kit;
        setKit(data.kit);
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [id]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [busy, load]);

  // Replace the kit with a server answer (after resume or regenerate), or update it
  // with a function of the latest kit (practice marks made in quick succession).
  const replace = useCallback((next) => {
    const value = typeof next === "function" ? next(kitRef.current) : next;
    kitRef.current = value;
    setKit(value);
  }, []);

  // → resolves with the saved kit, or rejects with the ApiError (after rollback).
  const runOp = useCallback(
    (op) => {
      const run = async () => {
        const before = kitRef.current;
        const preview = localApply(before, op);
        if (preview) {
          kitRef.current = preview;
          setKit(preview);
        }
        try {
          const { kit: saved } = await post(`/kits/${id}/ops`, { version: before.version, op });
          kitRef.current = saved;
          setKit(saved);
          return saved;
        } catch (e) {
          const latest = e.code === "VERSION_CONFLICT" && e.details.kit ? e.details.kit : before;
          kitRef.current = latest;
          setKit(latest);
          throw e;
        }
      };
      const result = queue.current.then(run, run);
      queue.current = result.catch(() => {});
      return result;
    },
    [id],
  );

  return { kit, error, reload: load, replace, runOp };
}
