/**
 * What a sequence's record reads of its own (the Sequences phone review's Reads on landing, 17 Oct 2026): the record leaned
 * on three old surfaces, the playbooks' for Turn on's when and how many, the reach-outs' chains for Add leads, and a run's
 * detail for a one-off's message. Each is a sequences read now, run here over the database in memory:
 *
 * - GET sequences/:id says what a sequence to leads writes to (`fed_by`: a list its owner adds leads to, or its search) and a
 *   one-off's message (`one_off`: its name, language and values, and the channels its customers' sends go by, none skipped,
 *   none guessed), and neither for any other sequence; a read of either that fails costs its line, never the record.
 * - GET sequences/:id/reach says who the first step's next run reaches, read off GET playbooks' own pools as the card reads
 *   them (its own count where its message is stricter, its list's, or its moment's, for the channels it goes by), the most a
 *   run sends and whether the workspace is paused; a sequence whose first step is no campaign's card is not found.
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
const { sequence, sequenceReach } = await import(at("apps/dashboard/src/server/readers/sequences.ts"));

beforeEach(() => readerCache.clear());

const TID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEADS = "11111111-1111-4111-8111-111111111111";
const ONE_OFF = "11111111-1111-4111-8111-111111111112";
const MOMENT = "11111111-1111-4111-8111-111111111113";
const SEARCH = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-16T16:00:00Z");

const needs = () => ({ waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] });
const first = (id, over = {}) => ({
  id,
  kind: "moment",
  trigger: "quiet_30",
  state: "running",
  policy_class: "reengage",
  run_hour: 10,
  list_id: null,
  list_key: null,
  list_name: null,
  search_id: null,
  search_name: null,
  owner_sends: false,
  until: null,
  trial_until: null,
  template_name: "come_back",
  template_language: "en_US",
  ...over,
});
const row = (id, name, starts, over = {}) => ({
  id,
  name,
  starts,
  state: "on",
  created_at: "2026-09-01T12:00:00Z",
  first: first(id),
  date: null,
  steps: 1,
  channels: [],
  needs: needs(),
  next: null,
  last: null,
  in_it: 0,
  ...over,
});
const ROWS = [
  row(LEADS, "Cold email to salons", "leads", {
    first: first(LEADS, { kind: "reach_out", trigger: "lead_first", search_id: SEARCH, search_name: "Salons nearby" }),
  }),
  row(ONE_OFF, "Holiday hours", "date", {
    first: null,
    date: { batch_id: ONE_OFF, state: "scheduled", at: "2026-10-20T14:00:00Z", people: 3 },
  }),
  row(MOMENT, "Win-back", "moment"),
];
const RPCS = {
  sequence_overview: (a) => ROWS.filter((r) => !a.p_sequence_id || r.id === a.p_sequence_id),
  sequence_steps_of: () => [],
};

/** A send of the one-off's batch: a customer's on a channel, or a lead's (which a one-off never has, and is never counted). */
const send = (n, over) => ({
  id: `44444444-4444-4444-8444-00000000000${n}`,
  tenant_id: TID,
  sequence_id: ONE_OFF,
  batch_id: ONE_OFF,
  contact_id: `55555555-5555-4555-8555-00000000000${n}`,
  lead_id: null,
  state: "queued",
  channel: "whatsapp",
  ...over,
});

const world = (over = {}) => ({
  tenants: [{ id: TID, name: "Harbor Studio", timezone: "America/New_York", config: {} }],
  policies: [],
  lead_searches: [{ id: SEARCH, tenant_id: TID, name: "Salons nearby", via: "maps" }],
  sequence_batches: [
    {
      id: ONE_OFF,
      tenant_id: TID,
      sequence_id: ONE_OFF,
      name: "Holiday hours",
      template_id: "66666666-6666-4666-8666-666666666666",
      template_name: "holiday_hours",
      template_language: "en_US",
      params: ["Dec 24"],
      audience: {},
      state: "scheduled",
      scheduled_for: "2026-10-20T14:00:00Z",
      channels: ["whatsapp", "sms", "email"],
    },
  ],
  sequence_sends: [
    send(1, { channel: "whatsapp" }),
    // A text that was skipped says no channel it goes by; an email still to go does.
    send(2, { channel: "sms", state: "skipped" }),
    send(3, { channel: "email" }),
  ],
  ...over,
});

const contextOf = (tables, faults = {}) =>
  readerContext(
    { supabase: fakeDb(tables, faults, RPCS, { missing: true }), userId: "u1" },
    { tenantId: TID, role: "operator", facts: {} },
    NOW,
  );
const recordOf = async (id, tables = world(), faults = {}) =>
  (await load(contextOf(tables, faults), sequence, { id })).data;

test("a sequence to leads says what it writes to: a list its owner adds leads to, else its search", async () => {
  assert.equal((await recordOf(LEADS)).fed_by, "search", "a search the finder keeps current");
  for (const via of ["import", "chosen"]) {
    const tables = world({ lead_searches: [{ id: SEARCH, tenant_id: TID, name: "My list", via }] });
    assert.equal(
      (await recordOf(LEADS, tables)).fed_by,
      "list",
      `a list of its owner's own (${via}): Add leads adds to it`,
    );
  }
  // A search no longer here is a search as before it was read: Add leads opens it, and the page says what it holds.
  assert.equal((await recordOf(LEADS, world({ lead_searches: [] }))).fed_by, "search");
  assert.equal("one_off" in (await recordOf(LEADS)), false, "and no one-off's message");
});

test("a one-off says its message, the values it is filled with, and the channels its customers' sends go by, none skipped", async () => {
  const rec = await recordOf(ONE_OFF);
  assert.deepEqual(rec.one_off, {
    template_name: "holiday_hours",
    template_language: "en_US",
    params: ["Dec 24"],
    channels: ["whatsapp", "email"],
  });
  assert.equal("fed_by" in rec, false, "and nothing a sequence to leads says");
  // A lead's send is no customer's: a one-off is never told it goes by email for one.
  const leadOnly = world({
    sequence_sends: [send(1, { contact_id: null, lead_id: "77777777-7777-4777-8777-777777777777", channel: "email" })],
  });
  assert.deepEqual((await recordOf(ONE_OFF, leadOnly)).one_off.channels, [], "none guessed before a send names one");
  // A batch of no workspace of this member's answers no message; the record still answers, naming the sequence alone.
  assert.equal((await recordOf(ONE_OFF, world({ sequence_batches: [] }))).one_off, null);
});

test("a read of either that fails costs its own line, never the record", async () => {
  const faults = { "sequence_batches.select": { message: "boom" }, "lead_searches.select": { message: "boom" } };
  const oneOff = await recordOf(ONE_OFF, world(), faults);
  assert.equal(oneOff.one_off, null, "the one-off names itself");
  assert.equal(oneOff.sequence.name, "Holiday hours", "and the record is whole");
  assert.equal((await recordOf(LEADS, world(), faults)).fed_by, "search", "Add leads opens the search");
});

test("any other sequence's record says neither", async () => {
  const rec = await recordOf(MOMENT);
  assert.equal("fed_by" in rec, false);
  assert.equal("one_off" in rec, false);
});

test("a record asked by a part of its sequence, a step's id or a batch's, is its sequence's; an id of nothing is not found", async () => {
  // Its own reads go out with the workspace's in one wave, by the id asked (the tabs review of 19 Oct 2026); an id that is
  // no sequence's finds no row, and the sequence it is a part of is read after it.
  const STEP = "88888888-8888-4888-8888-888888888888";
  const BATCH = "99999999-9999-4999-8999-999999999999";
  const [oneOff] = world().sequence_batches;
  const tables = world({
    sequence_steps: [{ id: STEP, tenant_id: TID, sequence_id: MOMENT }],
    sequence_batches: [oneOff, { ...oneOff, id: BATCH, sequence_id: LEADS }],
  });
  assert.equal((await recordOf(STEP, tables)).sequence.id, MOMENT, "a step's, as the step editor asks");
  assert.equal((await recordOf(BATCH, tables)).sequence.id, LEADS, "a batch's, as a run's address asks");
  assert.equal((await recordOf(MOMENT, tables)).sequence.id, MOMENT, "its own");
  await assert.rejects(recordOf("77777777-7777-4777-8777-000000000000", tables), /Sequence not found/);
});

/* ------------------------------------------------------------------------------------------- GET sequences/:id/reach -- */

/** A campaign's card as GET playbooks answers it, the fields the reach reads. */
const card = (id, over = {}) => ({
  id,
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  channels: null,
  cap_per_run: 25,
  ...over,
});
/** A moment's count: WhatsApp alone, and each other set of channels the composer may tick. */
const pool = (candidates, by = []) => ({
  candidates,
  held: 0,
  pool: candidates + 4,
  noYes: 1,
  stopped: 0,
  noNumber: 3,
  saidYes: candidates,
  by: by.map(([channels, n]) => ({
    candidates: n,
    held: 0,
    pool: n + 4,
    noYes: 0,
    stopped: 0,
    noNumber: 0,
    saidYes: n,
    channels,
  })),
});
/** GET playbooks' answer, held by the turn as its route reads it: what the reach reads of it is the card's. */
const reachOf = async (id, answer) => {
  const rc = contextOf(world());
  rc.turn.seed("playbooks", { pools: {}, ready: null, ...answer });
  return (await load(rc, sequenceReach, { id })).data;
};

test("Turn on's reach is the card's: its moment's count for the channels it goes by, the most a run sends, and the workspace's pause", async () => {
  const pools = { quiet_30: pool(12, [[["whatsapp", "email"], 19]]) };
  assert.deepEqual(await reachOf(MOMENT, { playbooks: [card(MOMENT)], pools }), {
    candidates: 12,
    cap_per_run: 25,
    paused: false,
  });
  assert.equal(
    (await reachOf(MOMENT, { playbooks: [card(MOMENT, { channels: ["whatsapp", "email"] })], pools })).candidates,
    19,
    "a campaign that ticks email too reads the count for that set",
  );
  assert.equal(
    (await reachOf(MOMENT, { playbooks: [card(MOMENT)], pools, ready: { paused: true } })).paused,
    true,
    "a workspace paused for billing",
  );
  assert.equal((await reachOf(MOMENT, { playbooks: [card(MOMENT, { cap_per_run: null })], pools })).cap_per_run, null);
  assert.equal(
    (await reachOf(MOMENT, { playbooks: [card(MOMENT)], pools: { quiet_30: null } })).candidates,
    null,
    "a moment that could not be counted: when alone, never a zero nobody counted",
  );
});

test("the count is read where the card reads it: its own where its message is stricter, else its list's", async () => {
  assert.equal(
    (
      await reachOf(MOMENT, {
        playbooks: [card(MOMENT)],
        pools: { quiet_30: pool(12), [`playbook:${MOMENT}`]: pool(7) },
      })
    ).candidates,
    7,
    "a message stricter than its moment is counted on its own",
  );
  const onList = card(MOMENT, { trigger: "saved_list", list_id: "88888888-8888-4888-8888-888888888888" });
  assert.equal(
    (await reachOf(MOMENT, { playbooks: [onList], pools: { "list:88888888-8888-4888-8888-888888888888": pool(5) } }))
      .candidates,
    5,
    "a campaign on one of the workspace's lists, by its list's token",
  );
  const onPeople = card(MOMENT, { trigger: "saved_list", list_key: "vip" });
  assert.equal((await reachOf(MOMENT, { playbooks: [onPeople], pools: { "seg:vip": pool(3) } })).candidates, 3);
});

test("a sequence whose first step is no campaign's card has no reach to read", async () => {
  await assert.rejects(reachOf(LEADS, { playbooks: [card(MOMENT)] }), (e) => e.status === 404);
});
