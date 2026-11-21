// Company crawl (spec step 2, D6). No hard-coded paths: links are found on the
// homepage, in the sitemap, and on promising pages one level down, then ranked by
// scoreLink — in code, so it costs no tokens and gives the same answer every run.
//
// Scope: only URLs on the same origin *and* under the start URL's directory, so
// http://localhost:8099/acme/ never wanders into /other-company/.

import { normalizeUrl } from "./url-guard.js";
import { cleanHtml } from "./fetch-page.js";

export const MAX_PAGES = 8; // fetched besides the homepage
export const MAX_DEPTH = 2;
export const MAX_SITEMAP_URLS = 500;

const HIRING_WORDS = [
  ["interview", 6], ["hiring", 5], ["how-we-hire", 6], ["careers", 5], ["career", 4], ["jobs", 4],
  ["join", 3], ["recruit", 4], ["work-with-us", 4], ["openings", 3], ["positions", 3], ["vacancies", 3],
  ["handbook", 2], ["talent", 2],
];
const ABOUT_WORDS = [
  ["about", 4], ["company", 3], ["team", 2], ["mission", 3], ["story", 2], ["culture", 3], ["values", 3],
  ["who-we-are", 4], ["engineering", 2], ["what-we-do", 3], ["leadership", 1],
];
const NEGATIVE_WORDS = [
  "login", "log-in", "signin", "sign-in", "signup", "sign-up", "register", "privacy", "terms", "cookie", "legal",
  "cart", "checkout", "pricing", "status", "/tag/", "/category/", "/feed", "unsubscribe", "/cdn-cgi/",
];
const BINARY_EXTENSIONS = /\.(pdf|jpe?g|png|gif|svg|webp|zip|gz|mp4|mp3|css|js|json|xml|ico|woff2?)$/i;

// A malformed escape ("/about%ZZ") would throw and fail the whole kit (review C3);
// the raw path scores well enough.
function safeDecode(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

// → { score, kind: "hiring" | "about" | null }. Path words weigh more than link text.
export function scoreLink({ url, text = "" }) {
  const parsed = new URL(url);
  const path = safeDecode(parsed.pathname).toLowerCase().replace(/[_\s]+/g, "-");
  const label = text.toLowerCase().replace(/\s+/g, "-");
  if (BINARY_EXTENSIONS.test(path)) return { score: 0, kind: null };
  if (NEGATIVE_WORDS.some((w) => path.includes(w) || label.includes(w.replace(/\//g, "")))) return { score: 0, kind: null };

  const pathTokens = path.split(/[^a-z0-9]+/).filter(Boolean);
  const labelTokens = label.split(/[^a-z0-9]+/).filter(Boolean);
  // Whole words only ("mission-42" must not match inside a blog slug by accident);
  // a word also matches its plural/longer form ("career" → "careers"). Phrases such
  // as "how-we-hire" match as a run of words.
  const has = (tokens, text, word) =>
    word.includes("-") ? `-${tokens.join("-")}-`.includes(`-${word}-`) : tokens.some((t) => t === word || t.startsWith(word));
  const tally = (words) =>
    words.reduce(
      (sum, [word, weight]) => sum + (has(pathTokens, path, word) ? weight : 0) + (has(labelTokens, label, word) ? weight * 0.75 : 0),
      0,
    );
  // News-style sections can hold a hiring post, so they are kept but ranked well below real pages.
  const damp = /\/(blog|news|press|posts?)\//.test(path) ? 0.25 : 1;
  const hiring = tally(HIRING_WORDS) * damp;
  const about = tally(ABOUT_WORDS) * damp;
  if (hiring === 0 && about === 0) return { score: 0, kind: null };
  return hiring >= about ? { score: hiring, kind: "hiring" } : { score: about, kind: "about" };
}

// → { reachable, companyName, homepage, pages, skipped, aboutFound, hiringFound }
// pages: [{ url, title, text, kind: "home" | "hiring" | "about", depth }]
// skipped: [{ url, reason }]
export async function crawlCompany(companyUrl, { fetcher, robots, maxPages = MAX_PAGES, log = () => {} }) {
  const start = normalizeUrl(companyUrl);
  const scopePrefix = start.origin + start.pathname.replace(/[^/]*$/, ""); // directory of the start URL
  const inScope = (url) => url.startsWith(scopePrefix);
  const skipped = [];
  const pages = [];

  const home = await fetchHtml(start.href);
  if (!home.ok) {
    return {
      reachable: false,
      companyName: nameFromHost(start),
      homepage: start.href,
      pages: [],
      skipped,
      aboutFound: false,
      hiringFound: false,
    };
  }
  pages.push({ url: home.url, title: home.page.title, text: home.page.text, kind: "home", depth: 0 });
  log(`crawl: homepage ok (${home.page.links.length} links)`);

  // Candidates: homepage links (depth 1) and sitemap URLs (depth 1).
  const candidates = new Map(); // url → { url, text, depth, score, kind }
  const visited = new Set([start.href, home.url]);
  const consider = (link, depth) => {
    if (!inScope(link.url) || visited.has(link.url) || depth > MAX_DEPTH) return;
    const { score, kind } = scoreLink(link);
    if (score <= 0) return;
    const existing = candidates.get(link.url);
    if (!existing || score > existing.score) candidates.set(link.url, { ...link, depth, score, kind });
  };
  home.page.links.forEach((link) => consider(link, 1));
  for (const url of await sitemapUrls()) consider({ url, text: "" }, 1);

  // Fetch the best candidate, then let promising pages add their own links.
  while (pages.length - 1 < maxPages && candidates.size > 0) {
    const next = [...candidates.values()].sort((a, b) => b.score - a.score || a.depth - b.depth)[0];
    candidates.delete(next.url);
    visited.add(next.url);
    const result = await fetchHtml(next.url);
    if (!result.ok) continue;
    visited.add(result.url);
    const kind = scoreLink({ url: result.url, text: result.page.title }).kind ?? next.kind;
    pages.push({ url: result.url, title: result.page.title, text: result.page.text, kind, depth: next.depth });
    log(`crawl: fetched ${kind} page ${result.url} (score ${next.score})`);
    if (next.depth < MAX_DEPTH) result.page.links.forEach((link) => consider(link, next.depth + 1));
  }

  return {
    reachable: true,
    companyName: home.page.siteName || nameFromTitle(home.page.title) || nameFromHost(start),
    homepage: home.url,
    pages,
    skipped,
    aboutFound: pages.some((p) => p.kind === "about"),
    hiringFound: pages.some((p) => p.kind === "hiring"),
  };

  async function fetchHtml(url) {
    if (!(await robots.isAllowed(url))) {
      skipped.push({ url, reason: "disallowed by robots.txt" });
      return { ok: false };
    }
    const result = await fetcher.fetchResource(url);
    if (!result.ok) {
      skipped.push({ url, reason: result.reason });
      log(`crawl: skipped ${url} — ${result.reason}`);
      return { ok: false };
    }
    const page = cleanHtml(result.body, result.url);
    if (!page.text) {
      skipped.push({ url, reason: "no readable text (the page may need JavaScript)" });
      return { ok: false };
    }
    return { ok: true, url: result.url, page };
  }

  // Sitemaps from robots.txt, else /sitemap.xml at the origin and in the start directory.
  async function sitemapUrls() {
    const listed = await robots.sitemaps(start.origin);
    const tries = listed.length > 0 ? listed : [...new Set([`${start.origin}/sitemap.xml`, `${scopePrefix}sitemap.xml`])];
    const urls = [];
    for (const sitemap of tries) {
      const result = await fetcher.fetchResource(sitemap, { types: ["application/xml", "text/xml"], maxBytes: MAX_PAGE_BYTES_SITEMAP });
      if (!result.ok) continue;
      for (const match of result.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
        try {
          urls.push(new URL(match[1].replace(/&amp;/g, "&")).href);
        } catch {
          // ignore malformed entries
        }
        if (urls.length >= MAX_SITEMAP_URLS) return urls;
      }
    }
    return urls;
  }
}

const MAX_PAGE_BYTES_SITEMAP = 2 * 1024 * 1024;

// "Acme — Rockets for everyone" → "Acme"
export function nameFromTitle(title) {
  const first = String(title ?? "").split(/\s[|–—:·-]\s|\s[|–—·]|[|–—·]\s/)[0].trim();
  return first.length > 0 && first.length <= 60 ? first : "";
}

function nameFromHost(url) {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "localhost" || /^[\d.]+$/.test(host)) {
    const segment = url.pathname.split("/").filter(Boolean)[0];
    return segment ? capitalise(segment) : host;
  }
  return capitalise(host.split(".")[0]);
}

function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
