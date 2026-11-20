// Practice ordering (app spec Decision 1: weighted sort, not spaced repetition).
// The candidate has a fixed, short horizon, so each session starts with what they
// know least and what matters most: least confident first, then must-have before
// nice, then the card practised longest ago. Unseen cards count as least confident.
// Shared so the API and the web app order cards identically.

export const CONFIDENCE = { AGAIN: 1, UNSURE: 2, GOT_IT: 3 };
export const CONFIDENCE_LABELS = { 1: "Again", 2: "Unsure", 3: "Got it" };

// items: [{ id, requirement_ids }]; practice: { [id]: { confidence, count, lastAt } }
// → the same items, in session order.
export function orderDeck(items, practice = {}, requirements = []) {
  const musts = new Set(requirements.filter((r) => r.priority === "must").map((r) => r.id));
  const time = (value) => (value ? new Date(value).getTime() : -Infinity); // unseen = longest ago
  return items
    .map((item, index) => {
      const entry = practice[item.id];
      return {
        item,
        index,
        confidence: entry?.confidence ?? 0,
        must: item.requirement_ids?.some((id) => musts.has(id)) ? 1 : 0,
        lastAt: time(entry?.lastAt),
      };
    })
    .sort((a, b) => a.confidence - b.confidence || b.must - a.must || a.lastAt - b.lastAt || a.index - b.index)
    .map(({ item }) => item);
}

// Covered vs not yet covered, per requirement: how many of its cards are "Got it".
// → [{ id, text, priority, total, gotIt }]
export function requirementProgress(requirements, items, practice = {}) {
  return requirements.map((r) => {
    const cards = items.filter((item) => item.requirement_ids?.includes(r.id));
    const gotIt = cards.filter((item) => practice[item.id]?.confidence === CONFIDENCE.GOT_IT).length;
    return { id: r.id, text: r.text, priority: r.priority, total: cards.length, gotIt };
  });
}
