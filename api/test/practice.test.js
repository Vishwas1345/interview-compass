import { test } from "node:test";
import assert from "node:assert/strict";
import { orderDeck, requirementProgress, CONFIDENCE } from "@interview-compass/shared";

const requirements = [
  { id: "r1", text: "Node.js", priority: "must" },
  { id: "r2", text: "Rust", priority: "nice" },
];
const items = [
  { id: "q1", requirement_ids: ["r2"] },
  { id: "q2", requirement_ids: ["r1"] },
  { id: "q3", requirement_ids: ["r1"] },
  { id: "q4", requirement_ids: [] },
];
const ids = (deck) => deck.map((i) => i.id);

test("cards marked Again come before Unsure, before Got it", () => {
  const practice = {
    q1: { confidence: CONFIDENCE.GOT_IT, lastAt: "2026-11-21T10:00:00Z" },
    q2: { confidence: CONFIDENCE.UNSURE, lastAt: "2026-11-21T10:00:00Z" },
    q3: { confidence: CONFIDENCE.AGAIN, lastAt: "2026-11-21T10:00:00Z" },
    q4: { confidence: CONFIDENCE.GOT_IT, lastAt: "2026-11-21T09:00:00Z" },
  };
  assert.deepEqual(ids(orderDeck(items, practice, requirements)), ["q3", "q2", "q4", "q1"]);
});

test("unseen cards count as least confident and come first, must-have before nice", () => {
  const practice = { q3: { confidence: CONFIDENCE.AGAIN, lastAt: "2026-11-21T10:00:00Z" } };
  assert.deepEqual(ids(orderDeck(items, practice, requirements)), ["q2", "q1", "q4", "q3"]);
});

test("same confidence and priority: the card practised longest ago first", () => {
  const practice = {
    q2: { confidence: CONFIDENCE.UNSURE, lastAt: "2026-11-21T12:00:00Z" },
    q3: { confidence: CONFIDENCE.UNSURE, lastAt: "2026-11-20T12:00:00Z" },
  };
  assert.deepEqual(ids(orderDeck(items.slice(1, 3), practice, requirements)), ["q3", "q2"]);
});

test("with no practice yet, must-haves lead and the original order breaks ties", () => {
  assert.deepEqual(ids(orderDeck(items, {}, requirements)), ["q2", "q3", "q1", "q4"]);
});

test("progress counts Got it cards per requirement", () => {
  const practice = { q2: { confidence: CONFIDENCE.GOT_IT }, q3: { confidence: CONFIDENCE.UNSURE } };
  assert.deepEqual(requirementProgress(requirements, items, practice).map((p) => [p.id, p.gotIt, p.total]), [["r1", 1, 2], ["r2", 0, 1]]);
});
