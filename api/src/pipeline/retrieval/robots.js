// robots.txt rules, fetched once per origin. A missing or unreadable robots.txt
// means no rules (the web's convention); a disallowed URL is never fetched.

import robotsParser from "robots-parser";
import { USER_AGENT } from "./fetch-page.js";

const ROBOTS_MAX_BYTES = 512 * 1024;

export function createRobots(fetcher) {
  const byOrigin = new Map();

  async function rulesFor(origin) {
    if (!byOrigin.has(origin)) {
      byOrigin.set(
        origin,
        (async () => {
          const robotsUrl = `${origin}/robots.txt`;
          const result = await fetcher.fetchResource(robotsUrl, { types: ["text/plain"], maxBytes: ROBOTS_MAX_BYTES });
          return robotsParser(robotsUrl, result.ok ? result.body : "");
        })(),
      );
    }
    return byOrigin.get(origin);
  }

  async function isAllowed(url) {
    const rules = await rulesFor(new URL(url).origin);
    return rules.isAllowed(url, USER_AGENT) !== false;
  }

  async function sitemaps(origin) {
    return (await rulesFor(origin)).getSitemaps();
  }

  return { isAllowed, sitemaps };
}
