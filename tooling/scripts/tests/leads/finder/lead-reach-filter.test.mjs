/**
 * The Leads table's Filter (Ruben, 30 Oct 2026: "an email list to send a sequence to vs a call list"): a lead with a
 * checked email, a checked phone, or both, read as the Reach column reads it. One rule, `leadReaches`, asked of a row's
 * slots by the page and of a page row's DTO by the export, so the file holds what the table showed.
 *
 * Pure: nothing here reads a file or a database. The fixtures are fictional -- every domain under .example, every phone
 * in 555-0100..0199.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_REACH_WORDS,
  leadReaches,
  leadReachOf,
  leadReachWord,
  leadSlots,
  toLeadRowVM,
} from "../../../../../packages/contracts/src/leads/leads.ts";
import { LeadExportQuerySchema } from "../../../../../packages/contracts/src/leads/lead-plan-schema.ts";

const TZ = "America/Chicago";
const NOW = new Date("2026-09-19T15:00:00.000Z");

/** A page row of the leads read, as the export and the page are both handed it. */
const row = (over = {}) => ({
  id: "1ead0000-0000-4000-8000-000000000001",
  search_id: "5e000000-0000-4000-8000-000000000001",
  search_name: "Personal trainers · Austin",
  place_id: "ChIJfixture0001",
  business_name: "Zilker Strength Lab",
  category: "Personal trainer",
  city: "Austin",
  state: "TX",
  street: "1200 Barton Springs Rd",
  postal_code: "78704",
  phone: "+15125550101",
  phone_agrees: true,
  phone_wrong: false,
  email: "hello@zilkerstrength.example",
  email_state: "ok",
  email_checked_at: "2026-09-18T19:15:00.000Z",
  website: "zilkerstrength.example",
  instagram: null,
  rating: 5,
  reviews: 16,
  stage: "ready",
  closed_reason: null,
  contact_id: null,
  last_outcome: null,
  last_note: null,
  contacted_at: null,
  converted_at: null,
  places: 1,
  found_at: "2026-09-18T19:14:00.000Z",
  exported_at: null,
  version: 1,
  member: {
    class: "qualified",
    fit: "strong",
    reason: "Independent studio, one location, coaching only",
    excluded_by: null,
    distance_m: 1931,
    counted: true,
    checks: [],
    other_emails: [],
  },
  ...over,
});

/** Every reach a lead can have, named for what it is. */
const LEADS = {
  both: row(),
  emailOnly: row({ phone_agrees: false }),
  phoneOnly: row({ email_state: "catch_all" }),
  wrongNumber: row({ phone_wrong: true, email_state: "invalid" }),
  noPhone: row({ phone: null, phone_agrees: false }),
  noEmail: row({ email: null, email_state: "none" }),
  stillChecking: row({ email_state: "checking", phone_agrees: false }),
  serverSilent: row({ email_state: "unknown" }),
};

/** The leads a filter leaves, by name: the page's rows and the export's DTOs, which must agree. */
const left = (want) => {
  const page = Object.keys(LEADS).filter((k) => leadReaches(toLeadRowVM(LEADS[k], TZ, NOW).slots, want));
  const file = Object.keys(LEADS).filter((k) => leadReaches(leadSlots(LEADS[k]), want));
  assert.deepEqual(file, page, "the export leaves what the table left");
  return page;
};

test("Checked email is a mailbox that exists; Checked phone a number the listing and the site agree on; both is both", () => {
  assert.deepEqual(left([]), Object.keys(LEADS), "no filter: every lead");
  assert.deepEqual(left(["email"]), ["both", "emailOnly", "noPhone"]);
  assert.deepEqual(left(["phone"]), ["both", "phoneOnly", "noEmail", "serverSilent"]);
  assert.deepEqual(left(["email", "phone"]), ["both"]);
  // What the Reach column draws as Checked is exactly what the filter keeps: the shape and the filter read one slot.
  const checked = (k, slot) => toLeadRowVM(LEADS[k], TZ, NOW).slots[slot].word === "Checked";
  assert.deepEqual(
    Object.keys(LEADS).filter((k) => checked(k, "mailbox")),
    left(["email"]),
  );
  assert.deepEqual(
    Object.keys(LEADS).filter((k) => checked(k, "phone")),
    left(["phone"]),
  );
});

test("a kept or flipped filter is read back in one order, each once, and nothing else", () => {
  assert.deepEqual(leadReachOf(["phone", "email", "phone"]), ["email", "phone"]);
  assert.deepEqual(leadReachOf(["fax", "phone"]), ["phone"]);
  assert.deepEqual(leadReachOf("email"), [], "a place kept before the Filter, or a stray value, is no filter");
  assert.deepEqual(leadReachOf(undefined), []);
});

test("the Filter's word says what is on", () => {
  assert.equal(leadReachWord([]), "Filter");
  assert.equal(leadReachWord(["email"]), LEAD_REACH_WORDS.email);
  assert.equal(leadReachWord(["phone"]), "Checked phone");
  assert.equal(leadReachWord(["email", "phone"]), "Checked email and phone");
});

test("the export takes the Filter's reach, and still takes a view without one (either deploy order)", () => {
  const view = { list: "ready", sort: "fit", dir: "asc" };
  assert.deepEqual(LeadExportQuerySchema.parse({ ...view, reach: ["email"] }).reach, ["email"]);
  assert.equal(LeadExportQuerySchema.parse(view).reach, undefined);
  assert.equal(LeadExportQuerySchema.safeParse({ ...view, reach: ["fax"] }).success, false);
  assert.equal(LeadExportQuerySchema.safeParse({ ...view, reach: ["email", "phone", "email"] }).success, false);
});
