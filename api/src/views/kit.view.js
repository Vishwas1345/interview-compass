// What leaves the server about a kit. Internal fields (owner, checkpoint, dedupe
// key, counters, dismissed list) stay server-side.
import { validateKit } from "@interview-compass/shared";

// The kit list.
export function kitSummary(doc) {
  return {
    id: String(doc._id),
    status: doc.status,
    company: doc.kit?.source.company || hostOf(doc.input.company_url),
    role: doc.kit?.role.title || "",
    days: doc.input.days,
    createdAt: doc.createdAt,
    ...(doc.counts ? { counts: doc.counts } : {}),
  };
}

// The kit page.
export function kitView(doc) {
  const check = doc.kit ? validateKit(doc.kit, { coverage: "warn" }) : null;
  return {
    ...kitSummary(doc),
    input: doc.input,
    progress: doc.progress ?? [],
    error: doc.error ?? null,
    kit: doc.kit ?? null,
    version: doc.version ?? 0,
    warnings: check?.warnings ?? [],
    scheduleStale: Boolean(doc.scheduleStale),
    regenerating: doc.regenerating ?? null,
    lastRegeneration: doc.lastRegeneration ?? null,
    practice: doc.practice ?? {},
    updatedAt: doc.updatedAt,
    completedAt: doc.completedAt ?? null,
  };
}

function hostOf(url) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return String(url);
  }
}
