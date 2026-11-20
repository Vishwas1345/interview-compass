// "Same posting and company submitted again" (spec): a key that ignores case,
// spacing and URL cosmetics, so a re-paste with different line breaks still matches.

import { createHash } from "node:crypto";
import { normalizeUrl } from "../pipeline/retrieval/url-guard.js";

export function dedupeKey(jd, companyUrl) {
  const posting = String(jd).toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(`${posting}\n${canonicalUrl(companyUrl)}`).digest("hex");
}

// "https://www.Acme.com/careers/" and "acme.com/careers" are the same company page.
export function canonicalUrl(companyUrl) {
  try {
    const url = normalizeUrl(companyUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${url.port ? `:${url.port}` : ""}${path}${url.search}`;
  } catch {
    return String(companyUrl).trim().toLowerCase();
  }
}
