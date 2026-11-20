// URL checks before any fetch (brief Section 11, D6).
// - normalizeUrl: accept "acme.com", reject non-http(s) schemes and embedded credentials.
// - assertUrlAllowed: when private URLs are disallowed (production), resolve the host
//   and reject loopback, private, link-local and other non-public addresses, so the
//   server cannot be pointed at its own network.

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UrlRejectedError extends Error {
  constructor(message) {
    super(message);
    this.name = "UrlRejectedError";
  }
}

export function normalizeUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw new UrlRejectedError("No URL given.");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UrlRejectedError(`"${raw}" is not a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlRejectedError(`Only http and https URLs are supported, not ${url.protocol}`);
  }
  if (url.username || url.password) throw new UrlRejectedError("URLs with embedded credentials are not allowed.");
  url.hash = "";
  return url;
}

export async function assertUrlAllowed(url, { allowPrivate, lookup = dnsLookup } = {}) {
  if (allowPrivate) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new UrlRejectedError(`Could not resolve ${host}.`);
    }
  }
  const blocked = addresses.find(isPrivateAddress);
  if (blocked) throw new UrlRejectedError(`${host} points to a private or local address (${blocked}).`);
}

export function isPrivateAddress(address) {
  if (isIP(address) === 4) return isPrivateV4(address);
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateV4(mapped[1]);
    return (
      lower === "::" ||
      lower === "::1" ||
      /^f[cd]/.test(lower) || // fc00::/7 unique local
      /^fe[89ab]/.test(lower) || // fe80::/10 link-local
      /^ff/.test(lower) // multicast
    );
  }
  return true; // not an IP at all: refuse rather than guess
}

function isPrivateV4(address) {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast and reserved
  );
}
