/**
 * An email waiting for your OK is read with its opening (30 Oct 2026: an OK sent openings its owner never read, five of
 * them guesses): GET sequences/:id/people, run over the database in memory, carries on each row waiting or held the
 * opening its send goes with and whether the check has read it, the send's own, in this workspace; every other row is
 * as 00442 sequence_people answers it.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache, load, readerContext } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { sequencePeople } = await import(at("apps/dashboard/src/server/readers/sequences.ts"));

beforeEach(() => readerCache.clear());

const TID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SEQ = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-30T12:00:00Z");
const send = (n) => `22222222-2222-4222-8222-00000000000${n}`;

const person = (group, n, over = {}) => ({
  group,
  contact_id: null,
  lead_id: `33333333-3333-4333-8333-00000000000${n}`,
  enrollment_id: null,
  send_id: send(n),
  batch_id: "44444444-4444-4444-8444-444444444444",
  name: `Shop ${n}`,
  place: 1,
  at: "2026-10-30T13:00:00Z",
  why: group === "held" ? "unbacked_fact" : null,
  hold_detail: null,
  ...over,
});
const sendRow = (n, over = {}) => ({
  id: send(n),
  tenant_id: TID,
  opening: `Shop ${n} runs Monday through Saturday.`,
  checked_at: "2026-10-29T21:05:00Z",
  ...over,
});

test("each email waiting or held is read with the opening it goes with and whether it is checked; no other row is", async () => {
  const rows = [
    person("waiting", 1),
    person("waiting", 2),
    person("held", 3),
    person("in", 4, { send_id: null }),
    person("done", 5),
    person("waiting", 6),
  ];
  const tables = {
    sequence_sends: [
      sendRow(1),
      // Asked again: the check writes it again.
      sendRow(2, { opening: null, checked_at: null }),
      sendRow(3, { opening: "Shop 3 is clearly busy." }),
      sendRow(5),
      // Another workspace's send by the same id is never read into this one's.
      sendRow(6, { tenant_id: OTHER, opening: "Not theirs." }),
    ],
  };
  const rpcs = { sequence_people: () => ({ counts: { waiting: 3, held: 1, in: 1, done: 1 }, rows }) };
  const rc = readerContext(
    { supabase: fakeDb(tables, {}, rpcs), userId: "u1" },
    { tenantId: TID, role: "operator", facts: {} },
    NOW,
  );
  const got = (await load(rc, sequencePeople, { id: SEQ })).data;
  const by = (n) => got.rows.find((r) => r.name === `Shop ${n}`);
  assert.deepEqual([by(1).opening, by(1).checked], ["Shop 1 runs Monday through Saturday.", true]);
  assert.deepEqual([by(2).opening, by(2).checked], [null, false]);
  assert.deepEqual([by(3).opening, by(3).checked], ["Shop 3 is clearly busy.", true]);
  // Someone in it between steps, or done: as the read answers them, no opening asked for.
  assert.equal("opening" in by(4), false);
  assert.equal("opening" in by(5), false);
  // A send this workspace cannot read is said as none written, never as another's words.
  assert.deepEqual([by(6).opening, by(6).checked], [null, false]);
  assert.deepEqual(got.counts, { waiting: 3, held: 1, in: 1, done: 1 });
});

test("a batch to leads counts the emails an OK sends: those planned, never one the check held (30 Oct 2026)", async () => {
  const { sequenceOverview } = await import("@chanlytics/db");
  const LEADS_BATCH = "55555555-5555-4555-8555-555555555551";
  const CUSTOMER_BATCH = "55555555-5555-4555-8555-555555555552";
  const batch = (id, kind) => ({
    at: "2026-10-30T13:00:00Z",
    id,
    people: 5,
    run_for: "2026-10-29",
    step_id: SEQ,
    audience: { kind, trigger: null },
  });
  const row = (id, b, kind) => ({
    id,
    name: id,
    starts: kind === "reach_out" ? "leads" : "moment",
    next: { at: "2026-10-30T13:00:00Z", id: b, place: 1, state: "pending_approval", people: 5 },
    needs: {
      held: 1,
      batches: [batch(b, kind)],
      replies: 0,
      to_send: 0,
      waiting: 1,
      oldest_at: null,
      waiting_people: 5,
    },
  });
  const planned = (n, b, state = "planned") => ({ id: send(n), tenant_id: TID, batch_id: b, state });
  const tables = {
    sequence_sends: [
      planned(1, LEADS_BATCH),
      planned(2, LEADS_BATCH),
      planned(3, LEADS_BATCH),
      planned(4, LEADS_BATCH),
      planned(5, LEADS_BATCH, "held"),
      { ...planned(6, LEADS_BATCH), tenant_id: OTHER },
    ],
  };
  const rpcs = {
    sequence_overview: () => [row("leads", LEADS_BATCH, "reach_out"), row("customers", CUSTOMER_BATCH, "playbook")],
  };
  const [leads, customers] = await sequenceOverview(fakeDb(tables, {}, rpcs), TID);
  // "Approve · 4 people", as four go: the held one waits for its own answer, in Needs you; another workspace's is none of these.
  assert.equal(leads.needs.batches[0].people, 4);
  assert.equal(leads.needs.waiting_people, 4);
  assert.equal(leads.next.people, 4);
  // A customer's batch is counted as the read counts it.
  assert.equal(customers.needs.batches[0].people, 5);
  assert.equal(customers.next.people, 5);
});
