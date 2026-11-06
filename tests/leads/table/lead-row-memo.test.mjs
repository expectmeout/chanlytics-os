/**
 * A lead's row made only when it says something else (surfaces/leads/row-memo.ts, decision 0103): a change while a member
 * reads rebuilt every row loaded. Every name here is made up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const { keptRows, leadRowsOf } = await importSrc("apps/dashboard/src/surfaces/leads/row-memo.ts");

const NOW = new Date("2026-11-05T15:00:10Z");
const LATER_THIS_MINUTE = new Date("2026-11-05T15:00:50Z");
const NEXT_MINUTE = new Date("2026-11-05T15:01:00Z");
const SEARCH = { id: "s1", plan: { terms: ["plumber"], criteria: [], exclusions: [] }, name: "Plumbers" };

const lead = (id, over = {}) => ({
  id,
  search_id: "s1",
  place_id: `ChIJfixture${id}`,
  business_name: `Quix ${id}`,
  category: "Plumber",
  city: "Queens",
  state: "NY",
  street: "1 Main St",
  phone: "+15125550142",
  phone_agrees: true,
  phone_wrong: false,
  email: "hello@quix.example",
  email_state: "ok",
  email_checked_at: null,
  website: "quix.example",
  instagram: null,
  rating: 4.9,
  reviews: 16,
  stage: "ready",
  closed_reason: null,
  contact_id: null,
  last_outcome: null,
  last_note: null,
  contacted_at: null,
  converted_at: null,
  places: 1,
  found_at: "2026-11-01T14:32:00.000Z",
  exported_at: null,
  version: 1,
  member: {
    class: "qualified",
    fit: "strong",
    reason: "Independent",
    excluded_by: null,
    distance_m: 2400,
    counted: true,
    checks: [],
    other_emails: [],
  },
  ...over,
});
const at = (now, search = SEARCH, tz = "America/New_York") => ({ tz, now, searchOf: () => search });

test("a row that says the same keeps its object, and one that says something else is the fresh copy", () => {
  const a = lead("a");
  const b = lead("b");
  const held = [a, b];
  const fresh = new Map([
    ["a", lead("a")],
    ["b", lead("b", { stage: "nurture" })],
  ]);
  const kept = keptRows(held, fresh);
  assert.equal(kept[0], a, "said the same: the row the page holds");
  assert.equal(kept[1], fresh.get("b"), "said something else: the fresh copy");
  const third = lead("c");
  assert.equal(keptRows([third], fresh)[0], third, "a row no read touched stays");
});

test("a row is made again for a new minute or a changed search, and not before", () => {
  const row = lead("a");
  const [first] = leadRowsOf([row], at(NOW));
  assert.equal(leadRowsOf([row], at(LATER_THIS_MINUTE))[0], first, "the same row, the same minute: the same words");
  assert.equal(
    leadRowsOf([row], at(LATER_THIS_MINUTE, { ...SEARCH, plan: { ...SEARCH.plan } }))[0],
    first,
    "a search read again that says the same plan: a refresh makes no row again for it",
  );
  const [nextMinute] = leadRowsOf([row], at(NEXT_MINUTE));
  assert.notEqual(nextMinute, first, "a new minute: its times move");
  const changed = { ...SEARCH, plan: { ...SEARCH.plan, terms: ["electrician"] } };
  const [replanned] = leadRowsOf([row], at(NEXT_MINUTE, changed));
  assert.notEqual(replanned, nextMinute, "a search whose plan changed: what it says of the row moved");
  assert.notEqual(leadRowsOf([row], at(NEXT_MINUTE, changed, "UTC"))[0], replanned, "another clock: its times moved");
  assert.notEqual(leadRowsOf([lead("a")], at(NEXT_MINUTE, changed, "UTC"))[0], replanned, "a changed row: made again");
});

test("a row with no search of its own in the read is made, and kept, as well", () => {
  const row = lead("a");
  const [first] = leadRowsOf([row], at(NOW, null));
  assert.equal(first.id, "a");
  assert.equal(leadRowsOf([row], at(LATER_THIS_MINUTE, null))[0], first);
});
