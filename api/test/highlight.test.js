import { test } from "node:test";
import assert from "node:assert/strict";
import { findQuoteRanges, splitByRanges } from "@interview-compass/shared";
import { normalise } from "../src/pipeline/extraction/extract-requirements.js";

const posting = `What you need
- 5+ years of professional backend development experience
- Strong experience with Node.js and TypeScript in production
Bonus points for
- Familiarity with Rust`;

const slice = (r) => posting.slice(r.start, r.end);

test("a quote is found despite case, punctuation and spacing differences, and mapped back to the original text", () => {
  const [range] = findQuoteRanges(posting, [{ id: "r2", quote: "STRONG experience with node.js and   TypeScript, in production" }]);
  assert.equal(slice(range), "Strong experience with Node.js and TypeScript in production");
  assert.deepEqual(range.ids, ["r2"]);
});

test("ranges come back sorted; a quote not in the posting is left out", () => {
  const ranges = findQuoteRanges(posting, [
    { id: "r3", quote: "Familiarity with Rust" },
    { id: "r1", quote: "5+ years of professional backend development experience" },
    { id: "r9", quote: "Kubernetes in anger" },
  ]);
  assert.deepEqual(ranges.map((r) => r.ids[0]), ["r1", "r3"]);
  assert.equal(slice(ranges[0]), "5+ years of professional backend development experience");
});

test("overlapping quotes merge into one highlight naming both requirements", () => {
  const ranges = findQuoteRanges(posting, [
    { id: "a", quote: "Strong experience with Node.js" },
    { id: "b", quote: "Node.js and TypeScript in production" },
  ]);
  assert.equal(ranges.length, 1);
  assert.deepEqual(ranges[0].ids, ["a", "b"]);
  assert.equal(slice(ranges[0]), "Strong experience with Node.js and TypeScript in production");
});

test("the matching agrees with extraction's own check on every quote it would keep", () => {
  for (const quote of ["years of professional backend", "node.js and typescript", "c++ and c#"]) {
    const found = findQuoteRanges(`${posting}\nWe also use C++ and C#.`, [{ id: "x", quote }]).length === 1;
    assert.equal(found, normalise(`${posting}\nWe also use C++ and C#.`).includes(normalise(quote)), quote);
  }
});

test("splitByRanges keeps every character, in order", () => {
  const ranges = findQuoteRanges(posting, [{ id: "r3", quote: "Familiarity with Rust" }]);
  const pieces = splitByRanges(posting, ranges);
  assert.equal(pieces.map((p) => p.text).join(""), posting);
  assert.deepEqual(pieces.at(-1), { text: "Familiarity with Rust", ids: ["r3"] });
});
