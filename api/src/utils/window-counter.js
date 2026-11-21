// Counts events per key within a sliding time window, in memory (one API instance,
// D9). Used for sign-in throttling; keys never hold more than `max` timestamps.
export function createWindowCounter({ max, windowMs, now = () => new Date() }) {
  const events = new Map(); // key → [timestamps]

  const recent = (key) => {
    const cutoff = now().getTime() - windowMs;
    const list = (events.get(key) ?? []).filter((at) => at > cutoff);
    if (list.length === 0) events.delete(key);
    else events.set(key, list);
    return list;
  };

  return {
    // → seconds until the key is allowed again, or 0 when it is allowed now.
    blockedFor(key) {
      const list = recent(key);
      if (list.length < max) return 0;
      return Math.ceil((list[0] + windowMs - now().getTime()) / 1000);
    },
    record(key) {
      const list = recent(key);
      list.push(now().getTime());
      events.set(key, list.slice(-max));
    },
    reset(key) {
      events.delete(key);
    },
  };
}
