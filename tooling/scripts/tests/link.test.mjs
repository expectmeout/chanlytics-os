/**
 * One derivation of "a web address": the person's page, the details route and
 * the door that stores a proposal link all judge the same way (contracts
 * link.ts, 00154).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkHost, normalizeLink, whyNotALink } from "@chanlytics/contracts";

test("normalizeLink keeps a web address as typed, trimmed, and supplies a missing https://", () => {
  assert.equal(normalizeLink("  https://docs.example.com/p/42 "), "https://docs.example.com/p/42");
  assert.equal(normalizeLink("http://docs.example.com/p/42"), "http://docs.example.com/p/42");
  assert.equal(normalizeLink("docs.example.com/p/42?v=2"), "https://docs.example.com/p/42?v=2");
  assert.equal(
    normalizeLink("Docs.Example.com/P/42"),
    "https://Docs.Example.com/P/42",
    "a path is case-sensitive: nothing is lower-cased",
  );
});

test("normalizeLink refuses what is not a page anyone opens", () => {
  for (const bad of [
    "",
    "   ",
    null,
    undefined,
    "docs",
    "https://docs",
    "mailto:ana@example.com",
    "javascript:alert(1)",
    "https://docs.example.com/p 42",
    `https://docs.example.com/${"x".repeat(500)}`,
  ])
    assert.equal(normalizeLink(bad), null, JSON.stringify(bad));
});

test("whyNotALink says which kind of not-an-address it was, in the owner's words, and nothing for an address", () => {
  assert.equal(whyNotALink("https://docs.example.com/p/42"), null);
  assert.equal(whyNotALink(""), "A web address is needed.");
  assert.equal(whyNotALink("https://docs.example.com/p 42"), "Only the address itself, with no spaces in it.");
  assert.equal(whyNotALink("mailto:ana@example.com"), "That needs to be a web address, starting with https://.");
  assert.equal(
    whyNotALink(`https://docs.example.com/${"x".repeat(500)}`),
    "That address is too long to store: paste the link itself, not a whole page.",
  );
  assert.equal(whyNotALink("docs"), "That needs a full web address, like docs.example.com/proposal.");
});

test("linkHost is the host without its www., for a row that says where the proposal lives", () => {
  assert.equal(linkHost("https://www.docs.example.com/p/42"), "docs.example.com");
  assert.equal(linkHost("https://Docs.Example.com/P/42"), "docs.example.com");
  assert.equal(linkHost("not a link"), "not a link");
});
