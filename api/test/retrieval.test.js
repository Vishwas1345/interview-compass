import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, assertUrlAllowed, isPrivateAddress } from "../src/pipeline/retrieval/url-guard.js";
import { createFetcher, cleanHtml } from "../src/pipeline/retrieval/fetch-page.js";
import { createRobots } from "../src/pipeline/retrieval/robots.js";
import { crawlCompany, scoreLink, nameFromTitle } from "../src/pipeline/retrieval/crawl.js";
import { startFixtureServer } from "./fixtures/server.js";

let fixtures;
before(async () => {
  fixtures = await startFixtureServer(0);
});
after(() => {
  fixtures.server.closeAllConnections();
  fixtures.server.close();
});

// Real fetch against the local fixture server, without the 1 req/s politeness delay.
function retrieval({ allowPrivate = true } = {}) {
  const fetcher = createFetcher({ allowPrivate, minIntervalMs: 0, sleep: async () => {} });
  return { fetcher, robots: createRobots(fetcher) };
}

// --- URL guard -------------------------------------------------------------

test("normalizeUrl adds https, drops the fragment, rejects other schemes and credentials", () => {
  assert.equal(normalizeUrl("acme.com/careers#top").href, "https://acme.com/careers");
  assert.throws(() => normalizeUrl("ftp://acme.com"), /Only http and https/);
  assert.throws(() => normalizeUrl("https://user:pw@acme.com"), /credentials/);
  assert.throws(() => normalizeUrl("   "), /No URL/);
});

test("private, loopback, link-local and metadata addresses are recognised", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip);
});

test("in production mode, a host resolving to a private address is rejected", async () => {
  const lookup = async () => [{ address: "10.0.0.5" }];
  await assert.rejects(assertUrlAllowed(new URL("https://intranet.test"), { allowPrivate: false, lookup }), /private or local/);
  await assert.rejects(assertUrlAllowed(new URL("http://127.0.0.1:8099/"), { allowPrivate: false }), /private or local/);
  await assertUrlAllowed(new URL("https://public.test"), { allowPrivate: false, lookup: async () => [{ address: "93.184.216.34" }] });
});

test("a redirect to a private address is refused when private URLs are blocked", async () => {
  const fetch = async (url) =>
    String(url).startsWith("https://public.test")
      ? new Response(null, { status: 302, headers: { location: "http://10.0.0.5/admin" } })
      : new Response("<p>secret</p>", { headers: { "content-type": "text/html" } });
  const lookup = async (host) => [{ address: host === "public.test" ? "93.184.216.34" : "10.0.0.5" }];
  const fetcher = createFetcher({ fetch, lookup, allowPrivate: false, minIntervalMs: 0, sleep: async () => {} });
  const result = await fetcher.fetchResource("https://public.test/");
  assert.equal(result.ok, false);
  assert.match(result.reason, /private or local/);
});

// Review S1 (2026-11-20): the URL parser rewrites [::ffff:127.0.0.1] to the hex form
// [::ffff:7f00:1], which the old string checks treated as public.
test("IPv4-mapped and other non-global IPv6 forms are private, in any notation", () => {
  for (const ip of [
    "::ffff:7f00:1", // 127.0.0.1, as the URL parser writes it
    "::ffff:a9fe:a9fe", // 169.254.169.254, cloud metadata
    "::ffff:a00:5", // 10.0.0.5
    "0:0:0:0:0:ffff:7f00:1",
    "::ffff:127.0.0.1",
    "::7f00:1", // IPv4-compatible (deprecated)
    "64:ff9b::7f00:1", // NAT64
    "2002:7f00:1::1", // 6to4 wrapping 127.0.0.1
    "2001:db8::1", // documentation
    "::",
  ]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  assert.equal(isPrivateAddress("2606:4700::1111"), false, "ordinary public IPv6 stays allowed");
  assert.equal(isPrivateAddress("2a00:1450:4001::200e"), false);
});

test("reserved IPv4 ranges are private too", () => {
  for (const ip of ["192.0.0.8", "198.18.0.1", "198.19.255.255", "192.0.2.1", "240.0.0.1"]) assert.equal(isPrivateAddress(ip), true, ip);
});

test("a company URL written as a mapped IPv6 literal is refused in production", async () => {
  for (const raw of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/latest/meta-data/", "http://[0:0:0:0:0:ffff:7f00:1]:8080/"]) {
    await assert.rejects(assertUrlAllowed(new URL(raw), { allowPrivate: false }), /private or local/, raw);
  }
});

test("a redirect to a mapped IPv6 literal is refused", async () => {
  const fetch = async (url) =>
    String(url).startsWith("https://public.test")
      ? new Response(null, { status: 302, headers: { location: "http://[::ffff:a9fe:a9fe]/latest/meta-data/" } })
      : new Response("<p>metadata</p>", { headers: { "content-type": "text/html" } });
  const fetcher = createFetcher({ fetch, lookup: async () => [{ address: "93.184.216.34" }], allowPrivate: false, minIntervalMs: 0, sleep: async () => {} });
  const result = await fetcher.fetchResource("https://public.test/");
  assert.equal(result.ok, false);
  assert.match(result.reason, /private or local/);
});

// Review C3/C4 (2026-11-20): one bad link or redirect failed the whole kit.
test("a link with a malformed escape is scored on its raw path instead of throwing", () => {
  assert.doesNotThrow(() => scoreLink({ url: "https://a.com/about%ZZ" }));
  assert.equal(scoreLink({ url: "https://a.com/careers%ZZ", text: "Careers" }).kind, "hiring");
});

test("a malformed or non-web redirect is a skipped page, not a crash", async () => {
  for (const location of ["http://[", "ftp://files.example/x", "javascript:alert(1)"]) {
    const fetch = async () => new Response(null, { status: 302, headers: { location } });
    const fetcher = createFetcher({ fetch, lookup: async () => [{ address: "93.184.216.34" }], allowPrivate: false, minIntervalMs: 0, sleep: async () => {} });
    const result = await fetcher.fetchResource("https://public.test/");
    assert.equal(result.ok, false, location);
    assert.match(result.reason, /redirect/, location);
  }
});

// --- fetching and cleaning ------------------------------------------------

test("a 404 is reported, not thrown", async () => {
  const result = await retrieval().fetcher.fetchResource(`${fixtures.origin}/missing/`);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "HTTP 404");
});

test("non-HTML content is refused", async () => {
  const result = await retrieval().fetcher.fetchResource(`${fixtures.origin}/acme/sitemap.xml`);
  assert.equal(result.ok, false);
  assert.match(result.reason, /content type "application\/xml"/);
});

test("a body larger than the cap is refused", async () => {
  const big = "x".repeat(5000);
  const fetch = async () => new Response(big, { headers: { "content-type": "text/html" } });
  const fetcher = createFetcher({ fetch, minIntervalMs: 0 });
  const result = await fetcher.fetchResource("http://localhost/big", { maxBytes: 1000 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /larger than 1000 bytes/);
});

test("server errors are retried, then reported", async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response("down", { status: 503 });
  };
  const fetcher = createFetcher({ fetch, minIntervalMs: 0, sleep: async () => {} });
  const result = await fetcher.fetchResource("http://localhost/");
  assert.equal(calls, 3);
  assert.match(result.reason, /HTTP 503 \(after 3 attempts\)/);
});

test("cleanHtml resolves relative links, drops scripts and boilerplate, keeps the title", () => {
  const page = cleanHtml(
    `<html><head><title>Acme | Home</title><script>var x = "tracking";</script></head>
     <body><nav><a href="careers/">Careers</a></nav><main><p>${"Real content. ".repeat(20)}</p></main>
     <a href="mailto:x@y.z">mail</a><a href="#top">top</a></body></html>`,
    "http://localhost:8099/acme/",
  );
  assert.equal(page.title, "Acme | Home");
  assert.ok(page.links.some((l) => l.url === "http://localhost:8099/acme/careers/" && l.text === "Careers"));
  assert.ok(!page.links.some((l) => l.url.startsWith("mailto:")));
  assert.ok(!page.text.includes("tracking"));
  assert.ok(page.text.startsWith("Real content."));
});

// --- link scoring -----------------------------------------------------------

test("hiring links outrank about links, which outrank everything else", () => {
  const score = (path, text = "") => scoreLink({ url: `https://acme.com${path}`, text });
  assert.equal(score("/company/how-we-hire").kind, "hiring");
  assert.ok(score("/careers").score > score("/about").score);
  assert.equal(score("/about").kind, "about");
  assert.ok(score("/blog/mission-42").score < 1, "a word inside a blog slug barely counts");
  assert.ok(score("/blog/how-we-hire").score < score("/careers").score, "a hiring blog post ranks below a careers page");
  assert.ok(score("/blog/how-we-hire").score > 0, "…but is still worth fetching if budget allows");
  assert.equal(score("/submission").score, 0, "words inside other words never match");
  assert.equal(score("/login", "Careers").score, 0); // negative word wins
  assert.equal(score("/careers.pdf").score, 0);
  assert.equal(score("/x", "Join our team").kind, "hiring"); // link text counts
});

test("nameFromTitle takes the part before a separator", () => {
  assert.equal(nameFromTitle("Acme Rockets — Reusable launch"), "Acme Rockets");
  assert.equal(nameFromTitle("Quietly | Noise-cancelling"), "Quietly");
  assert.equal(nameFromTitle("Inject Labs"), "Inject Labs");
});

// --- crawling the fixture sites --------------------------------------------

test("acme: finds the about page, the hiring page two clicks deep, and the sitemap-only handbook page", async () => {
  const result = await crawlCompany(`${fixtures.origin}/acme/`, retrieval());
  const urls = result.pages.map((p) => p.url.replace(fixtures.origin, ""));
  assert.equal(result.reachable, true);
  assert.equal(result.companyName, "Acme Rockets");
  assert.ok(urls.includes("/acme/company/"), urls.join(", "));
  assert.ok(urls.includes("/acme/company/how-we-hire.html"));
  assert.ok(urls.includes("/acme/handbook/engineering/interviews.html"));
  assert.equal(result.hiringFound, true);
  assert.equal(result.aboutFound, true);
  assert.ok(!urls.includes("/acme/blog/"), "blog is not worth fetching");
});

test("acme: the robots.txt-disallowed page is never fetched", async () => {
  const result = await crawlCompany(`${fixtures.origin}/acme/`, retrieval());
  assert.ok(!result.pages.some((p) => p.url.includes("/private/")));
});

test("quiet: reachable, but no hiring or about page, and nothing outside /quiet/ is fetched", async () => {
  const result = await crawlCompany(`${fixtures.origin}/quiet/`, retrieval());
  assert.equal(result.reachable, true);
  assert.equal(result.hiringFound, false);
  assert.equal(result.aboutFound, false);
  assert.equal(result.companyName, "Quietly");
  assert.ok(result.pages.every((p) => p.url.includes("/quiet/")));
});

test("a 404 homepage is recorded as unreachable, without throwing", async () => {
  const result = await crawlCompany(`${fixtures.origin}/missing/`, retrieval());
  assert.equal(result.reachable, false);
  assert.equal(result.pages.length, 0);
  assert.match(result.skipped[0].reason, /404/);
  assert.equal(result.companyName, "Missing");
});

test("with private URLs blocked, a localhost site is refused and recorded", async () => {
  const result = await crawlCompany(`${fixtures.origin}/acme/`, retrieval({ allowPrivate: false }));
  assert.equal(result.reachable, false);
  assert.match(result.skipped[0].reason, /private or local/);
});

test("the page budget is respected", async () => {
  const result = await crawlCompany(`${fixtures.origin}/acme/`, { ...retrieval(), maxPages: 1 });
  assert.equal(result.pages.length, 2); // homepage + 1
  assert.equal(result.pages[1].kind, "hiring"); // the best-scoring candidate goes first
});
