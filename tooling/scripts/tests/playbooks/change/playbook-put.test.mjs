/**
 * PUT playbooks/:id, run through route() with the database in memory (the moment spec §4.9 A5, decision D26). The route
 * declares its body: a change in place (any of state, name, run_hour, cap_per_run, gap_days, cadence_days, and since 00395
 * params, until and trial_until), the channels alone, or the whole playbook, and no other key. A change is judged against
 * the playbook as it stands and its message (core
 * checkPlaybookPatch) and written with its line in the ledger in one call (the change_playbook door, _change-door.mjs),
 * which answers what each field held; nothing to change writes nothing. On a database before the door (PGRST202) the
 * same change is written as it was before, for one release, and answers the same: either deploy order works.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { changePlaybookDoor } from "./_change-door.mjs";
import { PLAYBOOK_PATCH_WORDS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const playbook = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/route.ts"));
beforeEach(() => setRateStore(memoryStore()));
afterEach(() => setServiceClient(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const K1 = "99999999-9999-4999-8999-999999999991";
const K2 = "99999999-9999-4999-8999-999999999992";
const K3 = "99999999-9999-4999-8999-999999999993";
const L1 = "66666666-6666-4666-8666-666666666661";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});

/** A win-back by silence in Bayside, running at ten, 25 a run, a 90-day gap; and one of Harbor's, where they are a viewer. */
const row = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: "77777777-7777-4777-8777-777777777771",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  until: null,
  trial_until: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
/** The message the win-back sends, Bayside's: WhatsApp's approved version, one value. */
const message = {
  id: "77777777-7777-4777-8777-777777777771",
  tenant_id: B,
  channel: "whatsapp",
  name: "winback_offer",
  language: "en_US",
  body_preview: "We miss you, {{1}}",
  variables: ["1"],
  category: "marketing",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "meta",
  hidden_at: null,
  title: null,
  components: [],
};
const world = (over = {}) => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenants: [{ id: B, name: "Bayside", timezone: "America/New_York" }],
  templates: [message],
  playbooks: [row(K1, A), row(K2, B)],
  broadcasts: [],
  segments: [],
  decisions: [],
  events: [],
  ...over,
});

/** The change_playbook door in memory, as 00395 writes it (_change-door.mjs), on the member's session. */
const changeDoor = (tables) => changePlaybookDoor(tables, USER);
/** A database before the door's migration: PostgREST's answer for a function it does not hold. */
const noDoor = () => ({
  change_playbook: () => {
    throw Object.assign(new Error("Could not find the function public.change_playbook"), { code: "PGRST202" });
  },
});
const ctxFor = (tables, id, door = changeDoor) => ({
  supabase: fakeDb(tables, {}, door(tables)),
  userId: USER,
  email: "ada@example.com",
  params: { id },
});
const put = (tables, id, body, door = changeDoor) =>
  playbook.PUT.run(
    new Request("http://localhost/api/v1/x", { method: "PUT", body: JSON.stringify(body) }),
    ctxFor(tables, id, door),
  );
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("the route declares its body: a change in place, the channels alone, or the whole playbook, and never another key", () => {
  const body = playbook.PUT.input;
  assert.ok(body, "an input the API reference is written from");
  for (const ok of [
    { state: "paused" },
    { name: "Past clients", run_hour: 9 },
    { channels: ["whatsapp", "email"] },
    { name: null, trigger: "quiet_30", template_id: "t", params: [], run_hour: 10, cap_per_run: 25 },
    // Its words, its end and its trial (00395), alone or beside the six; null clears either date.
    { params: ["@first_name"] },
    { until: "2026-11-30", trial_until: null },
    { until: null, state: "paused" },
    { trial_until: "2026-10-18T14:00:00Z" },
  ])
    assert.equal(body.safeParse(ok).success, true, JSON.stringify(ok));
  for (const no of [
    { name: "x", template: "y" },
    { channels: ["sms"], name: "x" },
    { trigger: "quiet_30" },
    "paused",
    { until: 20261130 },
    { trial_until: 5 },
    { params: "@first_name" },
  ])
    assert.equal(body.safeParse(no).success, false, JSON.stringify(no));
});

test("its words, its end and its trial change in place: judged against the row and its message, written through the door with their line, answering what each held, and an undo writes it back", async () => {
  const tables = world({ playbooks: [row(K1, A), row(K2, B, { params: [{ kind: "text", value: "10% off" }] })] });
  setServiceClient(fakeDb(tables));
  const words = await put(tables, K2, { params: ["@first_name"] });
  assert.deepEqual(words, {
    id: K2,
    name: "Win-back",
    state: "running",
    was: { params: [{ kind: "text", value: "10% off" }] },
    decision_id: "decision-1",
  });
  const p = () => tables.playbooks.find((x) => x.id === K2);
  assert.deepEqual(p().params, [{ kind: "first_name" }], "stored as the specs a run fills");
  assert.deepEqual(tables.decisions[0].payload, { name: "Win-back", params: [{ kind: "first_name" }] });
  // The undo is the same door with what it held.
  assert.deepEqual((await put(tables, K2, words.was)).was, { params: [{ kind: "first_name" }] });
  assert.deepEqual(p().params, [{ kind: "text", value: "10% off" }]);

  const ends = await put(tables, K2, { until: "2099-11-30", trial_until: "2099-10-18T10:00:00-04:00" });
  assert.deepEqual(ends.was, { until: null, trial_until: null });
  assert.deepEqual([p().until, p().trial_until], ["2099-11-30", "2099-10-18T14:00:00.000Z"]);
  assert.deepEqual(
    tables.decisions.at(-1).payload,
    { name: "Win-back", until: "2099-11-30", trial_until: "2099-10-18T14:00:00.000Z" },
    "the line names each change as it was written",
  );
  // The same instant again, spelled another way, is nothing written; null clears each date.
  assert.deepEqual((await put(tables, K2, { trial_until: "2099-10-18T14:00:00Z" })).decision_id, null);
  const cleared = await put(tables, K2, { until: null, trial_until: null });
  assert.deepEqual(cleared.was, { until: "2099-11-30", trial_until: "2099-10-18T14:00:00.000Z" });
  assert.deepEqual([p().until, p().trial_until], [null, null]);
  assert.deepEqual(
    tables.decisions.map((d) => d.verb),
    ["change_playbook", "change_playbook", "change_playbook", "change_playbook"],
  );
});

test("its words, its end and its trial are refused in the product's words before anything is written: values its message does not take, an end in the past or no day, a trial's end that is no instant", async () => {
  const tables = world();
  setServiceClient(fakeDb(tables));
  await refused(put(tables, K2, { params: [] }), "validation", 400, "This template takes 1 value.");
  await refused(put(tables, K2, { params: ["@visit_when"] }), "validation", 400, "Only a reminder the day before");
  await refused(put(tables, K2, { until: "2020-01-01" }), "validation", 400, "An end is today or later");
  await refused(put(tables, K2, { until: "next month" }), "validation", 400, PLAYBOOK_PATCH_WORDS.untilDay);
  await refused(put(tables, K2, { trial_until: "next week" }), "validation", 400, PLAYBOOK_PATCH_WORDS.trialWhen);
  assert.deepEqual(tables.decisions, []);
  const p = tables.playbooks.find((x) => x.id === K2);
  assert.deepEqual([p.params, p.until, p.trial_until], [[], null, null]);
});

test("a change in place: judged against the row as it stands, written with its line in the ledger in one call, answering what each field held", async () => {
  const tables = world();
  setServiceClient(fakeDb(tables));
  const out = await put(tables, K2, { name: "  Past   clients ", run_hour: 9 });
  assert.deepEqual(out, {
    id: K2,
    name: "Past clients",
    state: "running",
    was: { name: "Win-back", run_hour: 10 },
    decision_id: "decision-1",
  });
  const p = tables.playbooks.find((x) => x.id === K2);
  assert.deepEqual([p.name, p.run_hour, p.cap_per_run], ["Past clients", 9, 25]);
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.payload.name, d.payload.run_hour]),
    [["change_playbook", "Past clients", 9]],
  );
  assert.deepEqual(tables.events, [], "the decision is the change's line: no second record of it");
  // The undo is the same door with what it held.
  const back = await put(tables, K2, out.was);
  assert.deepEqual([back.name, back.was], ["Win-back", { name: "Past clients", run_hour: 9 }]);
  // A pause is pause_playbook; the same state again is nothing written.
  const paused = await put(tables, K2, { state: "paused" });
  assert.deepEqual([paused.state, paused.was], ["paused", { state: "running" }]);
  // The no-op answers as the door's does: `was` empty and `decision_id` there, null.
  assert.deepEqual(await put(tables, K2, { state: "paused" }), {
    id: K2,
    name: "Win-back",
    state: "paused",
    was: {},
    decision_id: null,
  });
  assert.deepEqual(
    tables.decisions.map((d) => d.verb),
    ["change_playbook", "change_playbook", "pause_playbook"],
  );
});

test("two Pauses at once: one line in the ledger, both answer paused, and the one that changed nothing says so as the door does (was empty, decision_id null)", async () => {
  const tables = world();
  setServiceClient(fakeDb(tables));
  const both = await Promise.all([put(tables, K2, { state: "paused" }), put(tables, K2, { state: "paused" })]);
  assert.deepEqual(
    tables.decisions.map((d) => d.verb),
    ["pause_playbook"],
    "one pause, one line",
  );
  assert.deepEqual(
    both.map((x) => x.state),
    ["paused", "paused"],
  );
  const [wrote, nothing] = [...both].sort((x, y) => Object.keys(y.was).length - Object.keys(x.was).length);
  assert.deepEqual([wrote.was, typeof wrote.decision_id], [{ state: "running" }, "string"]);
  assert.deepEqual([nothing.was, nothing.decision_id], [{}, null]);
  assert.equal(tables.playbooks.find((x) => x.id === K2).state, "paused");
});

test("a change is refused in the product's words before anything is written: a state it does not have, a number out of bounds, a name past 80, a cadence off the month's offer, a resume on an archived list", async () => {
  const tables = world({
    playbooks: [row(K1, A), row(K2, B), row(K3, B, { trigger: "saved_list", list_id: L1, state: "paused" })],
    segments: [{ id: L1, tenant_id: B, name: "Regulars", archived_at: "2026-09-01T00:00:00Z", rule: null }],
  });
  setServiceClient(fakeDb(tables));
  await refused(put(tables, K2, { state: "sleeping" }), "validation", 400, PLAYBOOK_PATCH_WORDS.state);
  await refused(put(tables, K2, { run_hour: 7 }), "validation", 400, "The hour must be a whole number from 9 to 20.");
  await refused(put(tables, K2, { name: "x".repeat(81) }), "validation", 400, PLAYBOOK_PATCH_WORDS.nameLong(80));
  await refused(
    put(tables, K2, { cadence_days: 14 }),
    "validation",
    400,
    PLAYBOOK_PATCH_WORDS.cadenceOffer("Win-back"),
  );
  await refused(put(tables, K2, {}), "validation", 400, PLAYBOOK_PATCH_WORDS.nothing);
  await refused(put(tables, K3, { state: "running" }), "validation", 400, "Its list, Regulars, is archived.");
  await refused(put(tables, K1, { state: "paused" }), "forbidden", 403);
  assert.deepEqual(tables.decisions, []);
  assert.equal(tables.playbooks.find((x) => x.id === K2).run_hour, 10);
});

test("either deploy order works: on a database before the change_playbook door, a change is written as it was before, for one release, its record the one that database takes, and the same answer", async () => {
  const tables = world();
  setServiceClient(fakeDb(tables));
  const out = await put(tables, K2, { name: "Past clients", run_hour: 9 }, noDoor);
  assert.deepEqual(
    [out.id, out.name, out.state, out.was, out.decision_id],
    [K2, "Past clients", "running", { name: "Win-back", run_hour: 10 }, null],
  );
  const p = tables.playbooks.find((x) => x.id === K2);
  assert.deepEqual([p.name, p.run_hour], ["Past clients", 9]);
  // That database's ledger has no change_playbook: a rename or a new hour is the event the whole rewrite always wrote.
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.data.fields]),
    [["playbook.changed", ["name", "run_hour"]]],
  );
  const paused = await put(tables, K2, { state: "paused" }, noDoor);
  assert.deepEqual([paused.state, paused.was, typeof paused.decision_id], ["paused", { state: "running" }, "string"]);
  assert.deepEqual(
    tables.decisions.map((d) => d.verb),
    ["pause_playbook"],
    "a pause is pause_playbook, as the drawer's switch always wrote",
  );
  // The door's own refusals are core's, before either write: the old way refuses in the same words.
  await refused(
    put(tables, K2, { run_hour: 7 }, noDoor),
    "validation",
    400,
    "The hour must be a whole number from 9 to 20.",
  );
});
