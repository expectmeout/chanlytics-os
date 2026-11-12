/**
 * A sequence's People say why a lead added to its list is not planned, and offer Check again where the reason is an
 * address that could not be checked (decision 0131).
 *
 * The Sequences list says "3 leads couldn't be checked · since Oct 28" (decision 0128, stage 2), and the record those
 * three open on said only "Added Oct 29" of each, with nothing to press. GET sequences/:id/people now asks the door the
 * Leads page asks (sequence_queued_why_not, 00533) for the leads it lists as added and not planned, and the tab offers
 * Check again over the ones whose address could not be checked: the same door the Leads page presses, its role and its
 * spend rules.
 *
 * Run over the database in memory.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { SEQUENCE_PEOPLE_WORDS, leadsToCheckAgain, placeNotPlannedOf } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache, load, readerContext } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { sequencePeople } = await import(at("apps/dashboard/src/server/readers/sequences.ts"));

beforeEach(() => readerCache.clear());

const TID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEQ = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-12T12:00:00Z");
const lead = (n) => `33333333-3333-4333-8333-00000000000${n}`;

const person = (group, n, over = {}) => ({
  group,
  contact_id: null,
  lead_id: lead(n),
  enrollment_id: group === "queued" ? null : `55555555-5555-4555-8555-00000000000${n}`,
  send_id: null,
  batch_id: null,
  name: `Plumber ${n}`,
  place: 1,
  at: "2026-10-29T03:29:39Z",
  why: null,
  hold_detail: null,
  ...over,
});

/** The People read over the database in memory: who is in it, and why the door says each listed lead waits. */
async function peopleRead(rows, whyOf) {
  const asked = [];
  const rpcs = {
    sequence_people: () => ({ counts: { queued: rows.filter((r) => r.group === "queued").length, in: 1 }, rows }),
    sequence_queued_why_not: (a) => {
      asked.push(a);
      return a.p_lead_ids.map((id, i) => ({ lead_id: id, sequence_id: a.p_sequence_ids[i], why: whyOf(id) }));
    },
  };
  const rc = readerContext(
    { supabase: fakeDb({ sequence_sends: [] }, {}, rpcs), userId: "u1" },
    { tenantId: TID, role: "owner", facts: {} },
    NOW,
  );
  const got = (await load(rc, sequencePeople, { id: SEQ })).data;
  return { got, asked, by: (n) => got.rows.find((r) => r.lead_id === lead(n)) };
}

test("the People read says why each lead added and not planned cannot be planned, asked of those leads alone", async () => {
  const rows = [person("queued", 1), person("queued", 2), person("queued", 3), person("in", 4)];
  const { asked, by } = await peopleRead(rows, (id) => (id === lead(1) || id === lead(2) ? "unchecked" : null));
  assert.equal(by(1).why, "unchecked");
  assert.equal(by(2).why, "unchecked");
  assert.equal(by(3).why, null, "one its next batch takes keeps no reason");
  assert.equal(by(4).why, null, "someone in it between steps is never asked about");
  assert.equal(asked.length, 1, "one ask for the list's leads");
  assert.deepEqual([...asked[0].p_lead_ids].sort(), [lead(1), lead(2), lead(3)].sort());
  assert.deepEqual([...new Set(asked[0].p_sequence_ids)], [SEQ], "each asked of this sequence");
});

test("a reason that cannot be read costs the reason alone: the People still read", async () => {
  const rows = [person("queued", 1), person("in", 4)];
  // A handler that throws is the database refusing (tests/_fake-db.mjs): the door's answer is an error.
  const { got, by } = await peopleRead(rows, () => {
    throw new Error("the door did not answer");
  });
  assert.equal(got.rows.length, 2);
  assert.equal(by(1).why, null);
});

test("Check again covers the leads added whose address could not be checked, and no one else", () => {
  const rows = [
    person("queued", 1, { why: "unchecked" }),
    person("queued", 2, { why: "unchecked" }),
    person("queued", 3, { why: "written" }),
    person("queued", 5, { why: null }),
    person("in", 4, { why: "unchecked" }),
    person("queued", 6, { why: "unchecked", lead_id: null }),
  ];
  assert.deepEqual(leadsToCheckAgain(rows), [lead(1), lead(2)]);
  assert.deepEqual(leadsToCheckAgain([person("queued", 3, { why: "written" })]), []);
});

test("the words: a row says why, and the act says how many", () => {
  assert.equal(placeNotPlannedOf("unchecked"), "Their address couldn't be checked");
  assert.equal(SEQUENCE_PEOPLE_WORDS.checkAgainAll(1), "Check again");
  assert.equal(SEQUENCE_PEOPLE_WORDS.checkAgainAll(3), "Check these 3 again");
});
