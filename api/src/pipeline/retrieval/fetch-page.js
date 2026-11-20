// Guarded fetching and HTML cleaning (D6).
// fetchResource never throws for a bad page: it returns { ok: false, reason } so the
// caller can skip and record the source instead of failing the whole run.

import * as cheerio from "cheerio";
import { assertUrlAllowed, UrlRejectedError } from "./url-guard.js";
import { defaultSleep } from "../../lib/llm/rate-limiter.js";

export const PAGE_TIMEOUT_MS = 10_000;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const FETCH_ATTEMPTS = 3;
export const PAGE_TEXT_CAP = 6000;
export const HTML_TYPES = ["text/html", "application/xhtml+xml"];
export const USER_AGENT = "InterviewCompassBot/0.1 (interview prep research; respects robots.txt)";

export function createFetcher({
  fetch = globalThis.fetch,
  allowPrivate = true,
  lookup,
  sleep = defaultSleep,
  now = Date.now,
  minIntervalMs = 1000, // politeness: at most one request per second per host
} = {}) {
  const lastRequestAt = new Map();

  async function pace(host) {
    const wait = (lastRequestAt.get(host) ?? -Infinity) + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, now());
  }

  // → { ok: true, url, status, contentType, body } | { ok: false, url, status?, reason }
  async function fetchResource(startUrl, { types = HTML_TYPES, maxBytes = MAX_PAGE_BYTES } = {}) {
    let lastFailure;
    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
      const result = await fetchOnce(startUrl, { types, maxBytes });
      if (result.ok || !result.transient) return stripInternal(result);
      lastFailure = result;
      if (attempt < FETCH_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
    }
    return stripInternal({ ...lastFailure, reason: `${lastFailure.reason} (after ${FETCH_ATTEMPTS} attempts)` });
  }

  async function fetchOnce(startUrl, { types, maxBytes }) {
    let url = new URL(startUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      try {
        await assertUrlAllowed(url, { allowPrivate, lookup });
      } catch (error) {
        if (error instanceof UrlRejectedError) return { ok: false, url: url.href, reason: error.message };
        throw error;
      }
      await pace(url.host);

      let response;
      try {
        response = await fetch(url, {
          redirect: "manual", // every hop is re-checked by the guard above
          headers: { "User-Agent": USER_AGENT, Accept: types.join(", ") },
          signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });
      } catch (error) {
        const timeout = error.name === "TimeoutError" || error.name === "AbortError";
        return { ok: false, url: url.href, reason: timeout ? "timed out" : `network error (${error.cause?.code ?? error.message})`, transient: true };
      }

      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        url = new URL(response.headers.get("location"), url);
        continue;
      }
      if (!response.ok) {
        const transient = response.status === 429 || response.status >= 500;
        return { ok: false, url: url.href, status: response.status, reason: `HTTP ${response.status}`, transient };
      }

      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!types.includes(contentType)) {
        await response.body?.cancel();
        return { ok: false, url: url.href, status: response.status, reason: `unexpected content type "${contentType || "none"}"` };
      }

      const body = await readCapped(response, maxBytes);
      if (body === null) return { ok: false, url: url.href, status: response.status, reason: `larger than ${maxBytes} bytes` };
      return { ok: true, url: url.href, status: response.status, contentType, body };
    }
    return { ok: false, url: url.href, reason: `more than ${MAX_REDIRECTS} redirects` };
  }

  return { fetchResource };
}

function stripInternal({ transient, ...rest }) {
  return rest;
}

// Reads the body as text, giving up (null) as soon as it passes maxBytes.
async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// HTML → { title, siteName, description, text, links: [{ url, text }] }.
// Links are collected before boilerplate is removed (nav and footer hold most of them);
// text comes from <main>/<article> when they hold enough, else the cleaned <body>.
export function cleanHtml(html, pageUrl, { textCap = PAGE_TEXT_CAP } = {}) {
  const $ = cheerio.load(html);
  const base = new URL($("base[href]").attr("href") ?? pageUrl, pageUrl);

  const links = [];
  const seen = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    let url;
    try {
      url = new URL(href, base);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    url.hash = "";
    if (seen.has(url.href)) return;
    seen.add(url.href);
    links.push({ url: url.href, text: squash($(el).text() || $(el).attr("title") || "") });
  });

  const title = squash($("title").first().text());
  const siteName = squash($('meta[property="og:site_name"]').attr("content") ?? "");
  const description = squash($('meta[name="description"]').attr("content") ?? "");

  $("script, style, noscript, svg, iframe, template, form, nav, footer, header, aside").remove();
  const main = squash($("main, article, [role=main]").text());
  const body = squash($("body").text());
  const text = (main.length >= 200 ? main : body).slice(0, textCap);

  return { title, siteName, description, text, links };
}

function squash(value) {
  return String(value).replace(/\s+/g, " ").trim();
}
