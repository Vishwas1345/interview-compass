import { test } from "node:test";
import assert from "node:assert/strict";
import { searchDiscussion, aboutHiringAt } from "../src/pipeline/retrieval/search.js";

// Fake network: Tavily and HN answers chosen per test; every request is recorded.
function fakeFetch({ tavily = [], hn = [], tavilyStatus = 200, hnStatus = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push(href.includes("tavily") ? "tavily" : "hn");
    if (href.includes("tavily")) {
      return new Response(JSON.stringify({ results: tavily }), { status: tavilyStatus });
    }
    return new Response(JSON.stringify({ hits: hn }), { status: hnStatus });
  };
  return { fetch, calls };
}

const base = { companyName: "GitLab", companyUrl: "https://about.gitlab.com" };

test("without a Tavily key, only Hacker News is searched", async () => {
  const { fetch, calls } = fakeFetch();
  await searchDiscussion({ ...base, fetch });
  assert.deepEqual(calls, ["hn"]);
});

test("with a key, Tavily and Hacker News are both searched", async () => {
  const { fetch, calls } = fakeFetch();
  await searchDiscussion({ ...base, tavilyApiKey: "k", fetch });
  assert.deepEqual(calls, ["tavily", "hn"]);
});

test("a company on a private address is not searched, and the reason is recorded", async () => {
  const { fetch, calls } = fakeFetch();
  const result = await searchDiscussion({ companyName: "Acme", companyUrl: "http://localhost:8099/acme/", tavilyApiKey: "k", fetch });
  assert.deepEqual(calls, []);
  assert.equal(result.searched, false);
  assert.match(result.skipped_reason, /private address/);
});

test("only hits that name the company and talk about hiring are kept", async () => {
  const { fetch } = fakeFetch({
    tavily: [
      { title: "GitLab interview process", url: "https://a.test/1", content: "Four rounds including a technical interview." },
      { title: "GitLab pricing", url: "https://a.test/2", content: "Premium costs money." }, // not about hiring
      { title: "Interview tips", url: "https://a.test/3", content: "Generic advice for any company." }, // no company
    ],
  });
  const result = await searchDiscussion({ ...base, tavilyApiKey: "k", fetch });
  assert.deepEqual(result.sources.map((s) => s.url), ["https://a.test/1"]);
  assert.equal(result.found, true);
});

test("Hacker News comments are turned into plain text with a link to the item", async () => {
  const { fetch } = fakeFetch({
    hn: [{ objectID: "42", story_title: "Ask HN: hiring", comment_text: "<p>My GitLab interview had a take&#x27;home &amp; a pairing call.</p>" }],
  });
  const [source] = (await searchDiscussion({ ...base, fetch })).sources;
  assert.equal(source.url, "https://news.ycombinator.com/item?id=42");
  assert.equal(source.snippet, "My GitLab interview had a take'home & a pairing call.");
  assert.equal(source.provider, "hacker-news");
});

test("nothing relevant found is a normal outcome, not an error", async () => {
  const { fetch } = fakeFetch();
  const result = await searchDiscussion({ ...base, tavilyApiKey: "k", fetch });
  assert.equal(result.searched, true);
  assert.equal(result.found, false);
  assert.deepEqual(result.errors, []);
});

test("a failing provider is recorded and the other still runs", async () => {
  const { fetch, calls } = fakeFetch({
    tavilyStatus: 500,
    hn: [{ objectID: "1", title: "GitLab interview experience", story_text: "" }],
  });
  const result = await searchDiscussion({ ...base, tavilyApiKey: "k", fetch });
  assert.deepEqual(calls, ["tavily", "tavily", "hn"]); // 500 retried once
  assert.equal(result.errors[0].provider, "tavily");
  assert.equal(result.found, true);
});

test("a 401 from Tavily is not retried", async () => {
  const { fetch, calls } = fakeFetch({ tavilyStatus: 401 });
  await searchDiscussion({ ...base, tavilyApiKey: "bad", fetch });
  assert.deepEqual(calls, ["tavily", "hn"]);
});

test("duplicate URLs across providers are kept once", async () => {
  const hit = { title: "GitLab interview", url: "https://same.test/x", content: "GitLab hiring rounds" };
  const { fetch } = fakeFetch({ tavily: [hit, hit] });
  const result = await searchDiscussion({ ...base, tavilyApiKey: "k", fetch });
  assert.equal(result.sources.length, 1);
});

test("relevance: the company name must sit next to a hiring word", () => {
  assert.equal(aboutHiringAt("GitLab", "My GitLab interview had four rounds"), true);
  assert.equal(aboutHiringAt("GitLab", "I interviewed at GitLab last year"), true);
  assert.equal(aboutHiringAt("PostHog", "PostHog's hiring process is public"), true);
  assert.equal(aboutHiringAt("PostHog", "Preparing for the engineering SuperDay at PostHog"), true);
  assert.equal(aboutHiringAt("GitLab", "GitLab released a new CI feature. Separately, interview tips for everyone."), false);
});

test("relevance: a company named after a common word is not matched by that word", () => {
  assert.equal(aboutHiringAt("Quietly", "I quietly left the interview halfway through"), false);
  assert.equal(aboutHiringAt("Quietly", "My Quietly interview was a single call"), true);
});

test("relevance: names with regex characters are matched literally", () => {
  assert.equal(aboutHiringAt("C3.ai", "C3.ai interview questions"), true);
  assert.equal(aboutHiringAt("C3.ai", "C3xai interview questions"), false);
});
