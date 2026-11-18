/**
 * What a lead's own preview tells the writer of an email that carries its link (apps/edge/lib/previews/for-opening.ts, the
 * sprint's step 4): what it knows, what the lead did with it, what they said is not right, and a short mark of all three
 * for the send (channels checkedWordsOf), so a line written before the preview stood, or before they last used it, is
 * written again. Only an open preview says anything: one being made, failed, ended or someone's own says nothing.
 * Made-up businesses only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEAD_PREVIEW_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

const { previewDidMarkOf, previewFactsOf, previewForOpening } = await importSrc(
  "apps/edge/lib/previews/for-opening.ts",
);
const { checkInputOf } = await importSrc("apps/edge/lib/campaigns/reach-out/check-one.ts");

const NOW = new Date("2026-11-15T15:00:00Z");
const WS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const row = (over = {}) => ({
  id: "p1",
  tenant_id: WS,
  lead_id: LEAD,
  preview_tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  state: "ready",
  token: "TokenTokenTokenToken01",
  ends_at: "2026-12-10T00:00:00Z",
  asked_count: 0,
  call_count: 0,
  call_seconds: 0,
  not_right: [],
  ...over,
});
const PROFILE = {
  hours: null,
  address: "12 Main St, Austin, TX 78701",
  website: "https://harbormovers.example/",
  services: ["Local moves", "Packing", "Storage", "Pianos", "Offices"].map((name) => ({ name })),
};

test("what it knows: each fact it holds, and its services by their count and the first few", () => {
  const facts = previewFactsOf(row(), PROFILE);
  assert.equal(
    facts.knows,
    "address: 12 Main St, Austin, TX 78701; website: harbormovers.example; 5 services (Local moves, Packing, Storage, and more)",
  );
  assert.equal(previewFactsOf(row(), null).knows, null, "a record that could not be read says nothing it knows");
  // Its hours are none of the listing's: the page shows them as lacking, and the writer is told nothing of them.
  assert.ok(!/hours/.test(facts.knows), facts.knows);
  assert.ok(!facts.knows.includes(LEAD_PREVIEW_WORDS.missingWhy.hours));
  assert.equal(
    previewFactsOf(row(), { ...PROFILE, services: [{ name: "Local moves" }] }).knows.endsWith(
      "1 service (Local moves)",
    ),
    true,
  );
});

test("what they did: nothing until they text or call it, then its messages and its calls; what they said is not right", () => {
  assert.deepEqual([previewFactsOf(row(), PROFILE).tried, previewFactsOf(row(), PROFILE).said], [null, null]);
  const used = previewFactsOf(
    row({
      asked_count: 4,
      call_count: 1,
      call_seconds: 130,
      not_right: [{ fact: "Hours", said: "Saturday we close at 1" }],
    }),
    PROFILE,
  );
  assert.equal(used.tried, "4 messages · a call of 2 minutes");
  assert.equal(used.said, "Says the hours aren't right: “Saturday we close at 1”");
});

test("the mark moves when the preview does: another preview, a message, a call, a thing said not right", () => {
  const mark = previewDidMarkOf(row());
  assert.equal(mark, previewDidMarkOf(row()), "the same preview, unused, is the same mark");
  for (const other of [
    row({ id: "p2" }),
    row({ asked_count: 1 }),
    row({ call_count: 1 }),
    row({ not_right: [{ fact: "Hours" }] }),
  ])
    assert.notEqual(previewDidMarkOf(other), mark);
  assert.equal(previewFactsOf(row(), PROFILE).mark, mark);
});

test("only an open preview says anything: none, one being made, one that failed, ended or is someone's own say nothing", async () => {
  const forLead = (rows) => previewForOpening(fakeDb({ lead_previews: rows }), { tenantId: WS, leadId: LEAD }, NOW);
  assert.equal(await forLead([]), null);
  for (const state of ["building", "failed", "claimed", "ended"])
    assert.equal(await forLead([row({ state })]), null, state);
  assert.equal(await forLead([row({ ends_at: "2026-11-01T00:00:00Z" })]), null, "past its thirty days");
  const open = await forLead([row({ asked_count: 2 })]);
  assert.equal(open.tried, "2 messages");
  assert.equal(open.mark, previewDidMarkOf(row({ asked_count: 2 })));
});

test("the check's input for an email that carries their preview: the record holds it, and no listing fact stands in", () => {
  const lead = { business_name: "Harbor Movers", city: "Austin", rating: 4.9, reviews: 320, hours: null };
  const words = { subject: null, body: "{{opening}} Try it: {{their preview}}" };
  const sender = { name: "Northside Cleaning", what_we_do: null, tone: null };
  const facts = previewFactsOf(row({ asked_count: 3 }), PROFILE);
  const withIt = checkInputOf(lead, words, sender, "en", [], null, facts);
  assert.equal(withIt.record.preview_knows, facts.knows);
  assert.equal(withIt.record.preview_tried, "3 messages");
  assert.equal(withIt.fact, null, "a line about their preview is the writer's, never the listing's own sentence");
  // An email with no preview read: the record and the listing's own sentence as they always were.
  const without = checkInputOf(lead, words, sender, "en", [], null);
  assert.equal("preview_knows" in without.record, false);
  assert.notEqual(without.fact, null);
});
