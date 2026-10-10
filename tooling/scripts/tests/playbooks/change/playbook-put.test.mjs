/**
 * PUT playbooks/:id, run through route() with the database in memory (the moment spec §4.9 A5, decision D26). The route
 * declares its body: a change in place (any of state, name, run_hour, cap_per_run, gap_days, cadence_days), the channels
 * alone, or the whole playbook, and no other key. A change is judged against the playbook as it stands (core
 * checkPlaybookPatch) and written with its line in the ledger in one call (the change_playbook door, modelled below),
 * which answers what each field held; nothing to change writes nothing. On a database before the door (PGRST202) the
 * same change is written as it was before, for one release, and answers the same: either deploy order works.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
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
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
const world = (over = {}) => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  playbooks: [row(K1, A), row(K2, B)],
  broadcasts: [],
  segments: [],
  decisions: [],
  events: [],
  ...over,
});

/** The change_playbook door in memory: the columns named written, the decision as theirs, what each held answered. */
const changeDoor = (tables) => ({
  change_playbook: (a) => {
    const p = tables.playbooks.find((x) => x.id === a.p_playbook_id && x.tenant_id === a.p_tenant_id);
    if (!p) throw Object.assign(new Error("Playbook not found."), { code: "P0002" });
    const was = Object.fromEntries(Object.keys(a.p_set).map((k) => [k, p[k]]));
    Object.assign(p, a.p_set);
    const verb =
      a.p_set.state === "running"
        ? "start_playbook"
        : a.p_set.state === "paused"
          ? "pause_playbook"
          : "change_playbook";
    const decision = {
      id: `decision-${tables.decisions.length + 1}`,
      tenant_id: a.p_tenant_id,
      subject_type: "playbook",
      subject_id: p.id,
      verb,
      actor_user_id: USER,
      payload: { ...(a.p_decision ?? {}), ...(a.p_via ? { via: a.p_via } : {}) },
      undo_of: a.p_undo_of ?? null,
    };
    tables.decisions.push(decision);
    return { id: p.id, was, decision_id: decision.id, undo_dropped: false };
  },
});
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
  ])
    assert.equal(body.safeParse(ok).success, true, JSON.stringify(ok));
  for (const no of [{ name: "x", template: "y" }, { channels: ["sms"], name: "x" }, { trigger: "quiet_30" }, "paused"])
    assert.equal(body.safeParse(no).success, false, JSON.stringify(no));
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
  assert.deepEqual(await put(tables, K2, { state: "paused" }), { id: K2, name: "Win-back", state: "paused", was: {} });
  assert.deepEqual(
    tables.decisions.map((d) => d.verb),
    ["change_playbook", "change_playbook", "pause_playbook"],
  );
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
