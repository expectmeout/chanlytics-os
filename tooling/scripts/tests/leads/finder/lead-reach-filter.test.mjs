/**
 * The Leads table's Filter (Ruben, 30 Oct 2026: "an email list to send a sequence to vs a call list"): a lead with a
 * checked email, a checked phone, or both, read as the Reach column reads it. Since decision 0083's Phase B the rule is
 * the read's (00500 lead_matches), held to what the Reach column draws as Checked in
 * `tooling/scripts/tests/leads/lead-filters.db.test.mjs`; here, the Filter's kept value, its word and the export's input.
 *
 * Pure: nothing here reads a file or a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEAD_REACH_WORDS, leadReachOf, leadReachWord } from "../../../../../packages/contracts/src/leads/leads.ts";
import { LeadExportQuerySchema } from "../../../../../packages/contracts/src/leads/lead-plan-schema.ts";

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
  assert.equal(leadReachWord(["email", "phone"]), "Both checked");
});

test("the export takes the Filter's reach, and still takes a view without one (either deploy order)", () => {
  const view = { list: "ready", sort: "fit", dir: "asc" };
  assert.deepEqual(LeadExportQuerySchema.parse({ ...view, reach: ["email"] }).reach, ["email"]);
  assert.equal(LeadExportQuerySchema.parse(view).reach, undefined);
  assert.equal(LeadExportQuerySchema.safeParse({ ...view, reach: ["fax"] }).success, false);
  assert.equal(LeadExportQuerySchema.safeParse({ ...view, reach: ["email", "phone", "email"] }).success, false);
});
