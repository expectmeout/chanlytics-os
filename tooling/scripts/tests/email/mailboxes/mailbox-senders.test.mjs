/**
 * What a workspace says of a sender of its mailbox's mail, read (00483; contracts email/mailbox-senders.ts): the verdict
 * an address finds, by itself first and then by its domain and each domain above it, never a top-level domain alone;
 * which domain a workspace may say is automated as a whole (never a free-mail provider's, never its own); and the words
 * for every reason the mailbox leaves an email.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAILBOX_LEFT_WHY_WORDS,
  SCHEMA_SETS,
  senderDomainOffered,
  senderSortRefusal,
  senderVerdictOf,
} from "@chanlytics/contracts";

test("an address finds what was said of it, then of its domain and each domain above it; a top-level domain alone is never one", () => {
  const said = new Map([
    ["rosa@news.example", "person"],
    ["news.example", "automated"],
    ["vendor.example", "automated"],
    ["example", "automated"],
  ]);
  assert.equal(senderVerdictOf(said, "Rosa@News.example"), "person", "the address before its domain, however spelled");
  assert.equal(senderVerdictOf(said, "deals@news.example"), "automated");
  assert.equal(senderVerdictOf(said, "pat@billing.vendor.example"), "automated", "a domain holds for those below it");
  assert.equal(senderVerdictOf(said, "lee@other.example"), null, "a top-level domain is never one");
  assert.equal(senderVerdictOf(new Map(), "lee@other.example"), null);
});

test("a whole domain may be said to be automated, never a free-mail provider's or the business's own", () => {
  assert.equal(senderDomainOffered("account-update@amazon.com", ["getharbor.example"]), "amazon.com");
  assert.equal(senderDomainOffered("ana@gmail.com", []), null, "gmail.com is millions of people");
  assert.equal(senderDomainOffered("ana@outlook.com", []), null);
  assert.equal(
    senderDomainOffered("lead@GetHarbor.example", ["getharbor.example"]),
    null,
    "its own staff write from it",
  );
  assert.equal(senderSortRefusal("amazon.com", "automated", []), null);
  assert.match(senderSortRefusal("gmail.com", "automated", []), /mark one address instead/);
  assert.match(senderSortRefusal("getharbor.example", "automated", ["getharbor.example"]), /mark one address instead/);
  assert.equal(senderSortRefusal("ana@gmail.com", "automated", []), null, "one address is always one sender");
  assert.equal(senderSortRefusal("gmail.com", "person", []), null, "saying a domain is people narrows nothing");
  assert.equal(senderSortRefusal("gmail.com", null, []), null, "taking it back is always allowed");
});

test("every reason the mailbox leaves an email has the owner's words, and none more", () => {
  assert.deepEqual(Object.keys(MAILBOX_LEFT_WHY_WORDS).sort(), [...SCHEMA_SETS["mailbox_left.why"]].sort());
  for (const words of Object.values(MAILBOX_LEFT_WHY_WORDS)) assert.ok(words.length > 0 && words.length <= 60, words);
});
