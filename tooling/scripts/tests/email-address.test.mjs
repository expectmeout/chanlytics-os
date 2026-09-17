/**
 * What the product calls an email address, what it stores, and what it says
 * when it is given something else.
 *
 * One normalizer, beside the phone's, because the same question is about to be
 * asked in three places: the person's page, the door that stores the address
 * (00125), and the intake that finds a person by the address they wrote from.
 * The stored shape is the lookup key, so two spellings of one address must
 * come out the same, and two addresses that merely look alike must not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, whyNotAnEmail, erasedEmailHash, erasedPhoneHash } from "@chanlytics/contracts";

test("normalizeEmail, pinned by value: trimmed and lower-cased, and nothing else is changed", () => {
  assert.equal(normalizeEmail("ana@example.com"), "ana@example.com");
  assert.equal(normalizeEmail("  Ana@Example.COM "), "ana@example.com", "case and the spaces around it are not information");
  assert.equal(normalizeEmail("a.b+quotes@mail.example.co"), "a.b+quotes@mail.example.co", "dots and plus tags are kept: the product never guesses two addresses are one");
  assert.notEqual(normalizeEmail("a.b@example.com"), normalizeEmail("ab@example.com"));
  assert.equal(normalizeEmail("o'brien_x@example.io"), "o'brien_x@example.io");
});

test("what is not an address is null, whatever it resembles", () => {
  for (const bad of [
    "", "   ", null, undefined,
    "ana", "ana@", "@example.com", "ana@example", "ana@@example.com", "ana@exa mple.com",
    "Ana <ana@example.com>", "ana@example.com, bo@example.com", "ana@-example.com", "ana@example-.com",
    "ana..b@example.com", ".ana@example.com", "ana.@example.com",
    `${"a".repeat(65)}@example.com`, `a@${"b".repeat(250)}.com`,
    "ana@example.com\r\nBcc: x@evil.test",
  ]) {
    assert.equal(normalizeEmail(bad), null, JSON.stringify(bad));
  }
});

test("the door says WHICH kind of not-an-address it was given", () => {
  assert.equal(whyNotAnEmail("ana@example.com"), null, "an address has nothing to say about it");
  assert.equal(whyNotAnEmail(" Ana@Example.com "), null);
  assert.match(whyNotAnEmail(""), /is needed/);
  assert.match(whyNotAnEmail(null), /is needed/);
  assert.match(whyNotAnEmail("Ana <ana@example.com>"), /Only the address itself/);
  assert.match(whyNotAnEmail("ana example.com"), /Only the address itself/);
  assert.match(whyNotAnEmail("ana.example.com"), /missing the @/);
  assert.match(whyNotAnEmail("ana@@example.com"), /one @/);
  assert.match(whyNotAnEmail("ana@example"), /full domain/);
  assert.match(whyNotAnEmail("ana..b@example.com"), /not an email address anyone can be reached at/);
});

test("an erased address leaves the same kind of digest a number does: keyed by the workspace, of the stored spelling", async () => {
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const h = await erasedEmailHash(T, "ana@example.com");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await erasedEmailHash(T, normalizeEmail(" Ana@Example.com ")), "the digest is of what normalizeEmail stores");
  assert.notEqual(h, await erasedEmailHash(OTHER, "ana@example.com"), "tenant-keyed");
  assert.notEqual(h, await erasedEmailHash(T, "bo@example.com"));
  // Sharing one implementation did not move the number's digest: the rows 00124 wrote still match.
  assert.equal(await erasedPhoneHash(T, "+16465550123"), "56e86917ee6abdc0edbc7c5ee8f90437d6cb1549cdb35f0439f4e59634473588");
});
