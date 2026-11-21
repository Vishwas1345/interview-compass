// Review S2 (2026-11-20): ?next=/%5Cevil.com passed the old "starts with / and not //"
// check, and Next's router followed it to https://evil.com/ after sign-in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "@interview-compass/shared";

const ORIGIN = "https://app.test";

test("a path on this site is kept, with its query and hash", () => {
  assert.equal(safeNext("/kits/abc?tab=coverage#q3", ORIGIN), "/kits/abc?tab=coverage#q3");
  assert.equal(safeNext("/profile", ORIGIN), "/profile");
});

test("anything that would leave the site goes to /kits instead", () => {
  for (const value of [
    "/\\evil.com", // what ?next=/%5Cevil.com decodes to
    "/\t/evil.com", // ?next=/%09/evil.com
    "/\n/evil.com",
    "//evil.com",
    "/\\\\evil.com/x",
    "https://evil.com/",
    "javascript:alert(1)",
    "evil.com",
    "",
    null,
  ]) {
    assert.equal(safeNext(value, ORIGIN), "/kits", JSON.stringify(value));
  }
});
