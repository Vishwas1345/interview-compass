// URL checks before any fetch (brief Section 11, D6).
// - normalizeUrl: accept "acme.com", reject non-http(s) schemes and embedded credentials.
// - assertUrlAllowed: when private URLs are disallowed (production), resolve the host
//   and reject loopback, private, link-local and other non-public addresses, so the
//   server cannot be pointed at its own network.

import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

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

// Ranges, not strings (review S1): the URL parser rewrites IPv6 literals (e.g.
// [::ffff:127.0.0.1] becomes [::ffff:7f00:1]), so any text pattern can be dodged by
// another notation. net.BlockList compares the parsed address.
const PRIVATE_V4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 3], // multicast and reserved, up to 255.255.255.255
]) {
  PRIVATE_V4.addSubnet(network, prefix, "ipv4");
}

// IPv6: only ordinary public internet addresses (2000::/3) are fetchable. That leaves
// out loopback, unique local, link-local, multicast, and every way of embedding IPv4
// (::ffff:0:0/96 mapped, ::/96 compatible, 64:ff9b::/96 NAT64). Inside 2000::/3, the
// ranges that wrap IPv4 or are reserved are refused too.
const GLOBAL_V6 = new BlockList();
GLOBAL_V6.addSubnet("2000::", 3, "ipv6");
const RESERVED_V6 = new BlockList();
RESERVED_V6.addSubnet("2002::", 16, "ipv6"); // 6to4: wraps an IPv4 address
RESERVED_V6.addSubnet("2001:db8::", 32, "ipv6"); // documentation
RESERVED_V6.addSubnet("2001::", 32, "ipv6"); // Teredo: wraps an IPv4 address

export function isPrivateAddress(address) {
  const version = isIP(address);
  if (version === 4) return PRIVATE_V4.check(address, "ipv4");
  if (version === 6) return !GLOBAL_V6.check(address, "ipv6") || RESERVED_V6.check(address, "ipv6");
  return true; // not an IP at all: refuse rather than guess
}
