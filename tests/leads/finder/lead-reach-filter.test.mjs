/**
 * The Leads table's Filter (Ruben, 30 Oct 2026: "an email list to send a sequence to vs a call list"): a lead with a
 * checked email, a checked phone, or both, read as the Reach column reads it. Since decision 0083's Phase B the rule is
 * the read's (lead_view_rows), held to what the Reach column draws as Checked in
 * `tests/leads/lead-filters.db.test.mjs`; here, the Filter's kept value, its word and the export's input.
 *
 * Pure: nothing here reads a file or a database (the view's counts read a stand-in for one).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getLeadViewCounts } from "@chanlytics/db/leads";
import {
  LEAD_REACH_WORDS,
  LEAD_STATUS_GROUP_WORDS,
  leadFiltersOf,
  leadReachOf,
  leadReachWord,
  leadStatusGroupsOf,
} from "../../../packages/contracts/src/leads/leads.ts";
import { LeadExportQuerySchema, LeadsQuerySchema } from "../../../packages/contracts/src/leads/plan-schema.ts";

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

test("a kept status filter is read back in the queue's order, each once, and nothing else", () => {
  assert.deepEqual(leadStatusGroupsOf(["none", "needs", "none"]), ["needs", "none"]);
  assert.deepEqual(leadStatusGroupsOf(["late", "in"]), ["in"]);
  assert.deepEqual(leadStatusGroupsOf("needs"), [], "a stray value is no filter");
  assert.deepEqual(leadStatusGroupsOf(undefined), []);
  assert.deepEqual(LEAD_STATUS_GROUP_WORDS, { needs: "Needs you", in: "In a sequence", none: "Not in a sequence" });
});

test("the read takes the status filter as a query says it and as a body says it, and asks it as the rule does", () => {
  const view = { list: "ready", sort: "fit", dir: "asc" };
  assert.deepEqual(LeadsQuerySchema.parse({ ...view, status_group: "none,needs" }).status_group, ["needs", "none"]);
  assert.deepEqual(LeadExportQuerySchema.parse({ ...view, status_group: ["in"] }).status_group, ["in"]);
  assert.equal(LeadsQuerySchema.parse(view).status_group, undefined, "a read from before asks none");
  assert.equal(LeadsQuerySchema.safeParse({ ...view, status_group: "late" }).success, false);
  assert.equal(LeadsQuerySchema.safeParse({ ...view, status_group: ["in", "in", "in", "in"] }).success, false);
  assert.deepEqual(leadFiltersOf({ status_group: ["in", "needs"] }), { status_group: ["needs", "in"] });
  assert.equal(leadFiltersOf({ status_group: [] }), null, "none on is no filter");
});

test("what a view holds reads its status groups, and a database before 00552 costs them and nothing else", async () => {
  const asked = { tenantId: "t", searchId: null, cls: null, list: "all", filters: null };
  const answering = (data) => ({ rpc: async () => ({ data, error: null }) });
  const plain = { view: 9, matching: 8, excluded_by: { chains: 1 } };
  assert.deepEqual(await getLeadViewCounts(answering(plain), asked), plain);
  const told = { ...plain, status_groups: { needs: 2, in: 3, none: 4 }, with_email: 7, with_phone: 5 };
  assert.deepEqual(await getLeadViewCounts(answering(told), asked), told);
  const odd = { ...plain, status_groups: { needs: "two" }, with_email: -1, with_phone: 1.5 };
  assert.deepEqual(
    await getLeadViewCounts(answering(odd), asked),
    { ...plain, status_groups: { needs: 0, in: 0, none: 0 }, with_email: 0, with_phone: 0 },
    "a count that is no whole number of rows is none",
  );
});
