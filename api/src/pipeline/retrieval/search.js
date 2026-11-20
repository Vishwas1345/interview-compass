// Public discussion of a company's interview process (spec step 3, D7).
// Tavily when a key is set, Hacker News (Algolia API, no key) always. Searching by
// company *name*, never by domain. Finding nothing is a normal, recorded outcome.
//
// A hit is kept only if it names the company and talks about hiring, so a common
// company name doesn't drag in unrelated pages.

import { isIP } from "node:net";
import { isPrivateAddress } from "./url-guard.js";

export const SEARCH_TIMEOUT_MS = 10_000;
export const SEARCH_ATTEMPTS = 2;
export const MAX_SOURCES = 8;
export const SNIPPET_CAP = 1200;

const HIRING_WORDS = "interview\\w*|hiring|hired|recruit\\w*|onsite|on-site|take[- ]home|offer|superday|leetcode|system design|pair programming";

// True when the text talks about hiring *at this company*: the name sits within three
// words of a hiring word, in either order ("GitLab interview", "interviewed at GitLab",
// "PostHog's hiring"). The name must keep its own capitalisation, so a company called
// "Quietly" does not match "I quietly left the interview".
export function aboutHiringAt(name, text) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const gap = "(?:\\W+\\w+){0,3}?\\W+";
  const pattern = new RegExp(`\\b(${n})(?:'s)?${gap}(?:${HIRING_WORDS})|(?:${HIRING_WORDS})${gap}(${n})\\b`, "gi");
  for (const match of text.matchAll(pattern)) {
    if ((match[1] ?? match[2]) === name) return true;
  }
  return false;
}

// → { searched, skipped_reason, found, sources: [{ provider, title, url, snippet }], errors: [] }
export async function searchDiscussion({ companyName, companyUrl, tavilyApiKey, fetch = globalThis.fetch, log = () => {} }) {
  const result = { searched: false, skipped_reason: null, found: false, sources: [], errors: [] };

  const host = safeHost(companyUrl);
  if (host && isPrivateHost(host)) {
    result.skipped_reason = `the company site is on a private address (${host}), so a public search would only find unrelated companies`;
    return result;
  }
  const name = String(companyName ?? "").trim();
  if (!name) {
    result.skipped_reason = "no company name could be determined";
    return result;
  }

  result.searched = true;
  const relevant = (hit) => aboutHiringAt(name, `${hit.title} ${hit.snippet}`);

  const providers = [];
  if (tavilyApiKey) providers.push(["tavily", () => searchTavily(name, tavilyApiKey, fetch)]);
  providers.push(["hacker-news", () => searchHackerNews(name, fetch)]);

  for (const [provider, run] of providers) {
    try {
      const hits = (await withRetry(run)).filter(relevant);
      log(`search: ${provider} → ${hits.length} relevant result(s)`);
      result.sources.push(...hits.map((h) => ({ provider, ...h })));
    } catch (error) {
      result.errors.push({ provider, reason: error.message });
      log(`search: ${provider} failed — ${error.message}`);
    }
  }

  const seen = new Set();
  result.sources = result.sources.filter((s) => !seen.has(s.url) && seen.add(s.url)).slice(0, MAX_SOURCES);
  result.found = result.sources.length > 0;
  return result;
}

async function searchTavily(name, apiKey, fetch) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `"${name}" interview process experience`, max_results: 6, search_depth: "basic" }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new HttpError(response.status);
  const data = await response.json();
  return (data.results ?? []).map((r) => ({ title: clean(r.title), url: r.url, snippet: clean(r.content).slice(0, SNIPPET_CAP) }));
}

async function searchHackerNews(name, fetch) {
  const query = new URLSearchParams({ query: `${name} interview`, tags: "(story,comment)", hitsPerPage: "15" });
  const response = await fetch(`https://hn.algolia.com/api/v1/search?${query}`, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  if (!response.ok) throw new HttpError(response.status);
  const data = await response.json();
  return (data.hits ?? []).map((h) => ({
    title: clean(h.title ?? h.story_title ?? "Hacker News comment"),
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    snippet: clean(h.comment_text ?? h.story_text ?? "").slice(0, SNIPPET_CAP),
  }));
}

class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.transient = status === 429 || status >= 500;
  }
}

async function withRetry(run) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const transient = error.transient ?? true; // network errors and timeouts are transient
      if (!transient || attempt >= SEARCH_ATTEMPTS) throw error;
    }
  }
}

function safeHost(url) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}

function isPrivateHost(host) {
  if (host === "localhost" || /\.(localhost|local|internal|test|lan)$/.test(host)) return true;
  return isIP(host) ? isPrivateAddress(host) : false;
}

// Search results arrive with HTML tags and entities; keep plain text only.
function clean(text) {
  return String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
