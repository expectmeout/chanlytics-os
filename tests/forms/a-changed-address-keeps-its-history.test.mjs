/**
 * What a changed address says on a screen (00726; the whole-system plan of 28 Nov 2026, lane 3, R3.11). The reply to a
 * request may put the request's own address on its person's page, by the member's pick. The change itself is the
 * database's (set_person_email: the event holds the address before and after, a yes to offers by email the old address
 * gave is set back to not asked, and what stopped mail to the old address is kept), proved on the database by
 * people/person-email.db.test.mjs. Here: the words. Activity's line names both addresses, where it named neither; a
 * first address is said as before; and the person's page says why offers by email are off, never "never asked".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityWords } from "@chanlytics/contracts";
import { personRow } from "../consent/_person-row.mjs";

test("Activity's line for a changed address names the one before and the one after", () => {
  assert.equal(
    activityWords("contact.email_set", {
      set: true,
      by: "u1",
      source: "member",
      was: "ana.old@example.com",
      now: "ana.new@example.com",
    }),
    "A person's email address changed · from ana.old@example.com to ana.new@example.com",
    "REGRESSION: the line said an address changed and named neither, so the old one was lost with the change",
  );
  assert.equal(
    activityWords("contact.email_set", { set: false, by: "u1", source: "member", was: "ana.old@example.com" }),
    "A person's email address changed · ana.old@example.com taken off",
    "an address cleared says the one that went",
  );
});

test("a first address, and an erased person's line, are said by the kind's words alone", () => {
  assert.equal(
    activityWords("contact.email_set", { set: true, by: "u1", source: "member" }),
    "A person's email address changed",
    "nothing was lost with a first address, and it is never named",
  );
  assert.equal(
    activityWords("contact.email_set", { by: "u1", source: "member", scrubbed_at: "2026-11-28T00:00:00Z" }),
    "A person's email address changed",
    "an erasure scrubs both addresses from the line",
  );
});

test("a person's page says a yes to offers by email ended with their old address, never that nobody asked", () => {
  const ended = personRow({
    email: "ana.new@example.com",
    email_marketing: "unknown",
    email_marketing_source: "address_changed",
    email_marketing_updated_at: "2026-11-28T12:00:00Z",
  }).consent;
  assert.deepEqual(
    [ended.emailOffersLabel, ended.emailOffersSub],
    ["Not asked", "their yes ended when their email address changed"],
  );
  const never = personRow({
    email: "bo@example.com",
    email_marketing: "unknown",
    email_marketing_source: null,
  }).consent;
  assert.notEqual(never.emailOffersSub, ended.emailOffersSub, "someone never asked is said as before");
});
