// Where in the posting each requirement came from, for the Job description view.
// Quotes were verified ignoring case, punctuation and spacing (extraction's
// normalise), so an exact substring search would miss many; this repeats the same
// normalisation while remembering each kept character's position in the original.

const KEEP = /[a-z0-9+#]/;

function normaliseWithMap(text) {
  let normalised = "";
  const map = []; // map[i] = index in `text` of normalised[i]
  for (let i = 0; i < text.length; i += 1) {
    const kept = text[i].toLowerCase().normalize("NFKD").split("").filter((c) => KEEP.test(c));
    if (kept.length > 0) {
      for (const c of kept) {
        normalised += c;
        map.push(i);
      }
    } else if (normalised.length > 0 && !normalised.endsWith(" ")) {
      normalised += " ";
      map.push(i);
    }
  }
  return { normalised, map };
}

const normalise = (text) => normaliseWithMap(String(text ?? "")).normalised.trim();

// quotes: [{ id, quote }] → ranges in `text`, sorted, overlaps merged:
// [{ start, end, ids: [id, …] }]. A quote that cannot be found is left out.
export function findQuoteRanges(text, quotes) {
  const { normalised, map } = normaliseWithMap(String(text ?? ""));
  const ranges = [];
  for (const { id, quote } of quotes) {
    const needle = normalise(quote);
    if (!needle) continue;
    const at = normalised.indexOf(needle);
    if (at < 0) continue;
    ranges.push({ start: map[at], end: map[at + needle.length - 1] + 1, ids: [id] });
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start < last.end) {
      last.end = Math.max(last.end, range.end);
      last.ids.push(...range.ids);
    } else {
      merged.push({ ...range, ids: [...range.ids] });
    }
  }
  return merged;
}

// Splits text into plain and highlighted pieces for rendering.
// → [{ text, ids: [] | [id, …] }]
export function splitByRanges(text, ranges) {
  const pieces = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) pieces.push({ text: text.slice(cursor, r.start), ids: [] });
    pieces.push({ text: text.slice(r.start, r.end), ids: r.ids });
    cursor = r.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), ids: [] });
  return pieces;
}
