/**
 * The workspace's logo as contracts says it (logo/logo.ts): its initials where it has no logo, the one shape of address
 * kept and where it is served, and the words for a look that found nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOGO_BASE64_MAX,
  LOGO_BYTES_MAX,
  LOGO_LOOKUP_OUTCOMES,
  isLogoPathOf,
  logoFoundOn,
  logoLookupWords,
  workspaceInitials,
  workspaceLogoPath,
  workspaceLogoSrc,
} from "@chanlytics/contracts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const F = "11111111-1111-4111-8111-111111111111";

test("a workspace's initials: the first letters of its first two words, an ampersand or a leading The never one of them", () => {
  for (const [name, said] of [
    ["Bella & Co Studio", "BC"],
    ["Nails & Co", "NC"],
    ["The Hair Studio", "HS"],
    ["Rosa's Nail Bar", "RN"],
    ["Hair & Beauty by Lea", "HB"],
    ["Chanlytics E2E Studio", "CE"],
    ["Ötzi Café", "ÖC"],
    ["The", "T"],
    ["  ", "—"],
    [null, "—"],
    ["& & &", "—"],
  ])
    assert.equal(workspaceInitials(name), said, String(name));
});

test("a picture's address is the workspace's own folder and a new name, and only that is served", () => {
  const p = workspaceLogoPath(A, F);
  assert.equal(p, `${A}/${F}.png`);
  assert.equal(isLogoPathOf(A, p), true);
  assert.equal(isLogoPathOf(B, p), false, "another workspace's folder is not this one's");
  for (const bad of [`${A}/${F}.svg`, `${A}/logo.png`, `${A}/../${B}/${F}.png`, `${F}.png`, null, ""])
    assert.equal(isLogoPathOf(A, bad), false, String(bad));
  assert.equal(
    workspaceLogoSrc("https://proj.supabase.co", p),
    `https://proj.supabase.co/storage/v1/object/public/workspace-logos/${p}`,
  );
  assert.equal(workspaceLogoSrc("https://proj.supabase.co", `${A}/x.svg`), null, "nothing we did not write");
  assert.equal(workspaceLogoSrc("http://example.com", p), null, "never served from an address a browser would refuse");
  assert.equal(workspaceLogoSrc(null, p), null);
});

test("the weight kept travels as base64 inside the save's limit", () => {
  assert.equal(LOGO_BYTES_MAX, 262_144, "the bucket's own limit (00407)");
  assert.equal(LOGO_BASE64_MAX, 349_528);
  assert.ok(Buffer.alloc(LOGO_BYTES_MAX).toString("base64").length <= LOGO_BASE64_MAX);
});

test("a look that found nothing says why in the owner's words; one that found a picture names the site, never a file", () => {
  for (const o of LOGO_LOOKUP_OUTCOMES) {
    const w = logoLookupWords(o);
    if (o === "found") assert.equal(w, null);
    else assert.ok(w && !/png|svg|pixel|file/i.test(w), `${o}: ${w}`);
  }
  assert.equal(logoFoundOn("bellastudio.example.com"), "Found on bellastudio.example.com");
});
