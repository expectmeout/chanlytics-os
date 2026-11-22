/**
 * Stop everything (server/ask/act/stop.ts, D22 of the answers canvas). The stop itself is written first, on the
 * workspace's own row (tenants.sending_stopped_at), and from then the send door holds whatever goes out on its own; the
 * pauses after it are clean-up. So a pause that fails no longer means something still sends: the answer says stopped. On
 * a database the stop's column has not reached, or a write of it that fails, the stop is what the pauses make it, as
 * before: it says what it could not stop, and a second press tries again. Resume puts back what the stop paused, then
 * lifts the stop, and keeps what did not come back. Each sequence is paused through its own door, a request of the
 * member's own, so `fetch` is stood in for, as the door would answer: a pause that is refused leaves that sequence running.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { linesOf } from "../../_log-lines.mjs";
import { withoutColumns } from "../../_schema.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { stopEverything, resumeEverything } = await import(at("apps/dashboard/src/server/ask/act/stop.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WIN_BACK = "11111111-1111-4111-8111-111111111111";
const REMINDER = "22222222-2222-4222-8222-222222222222";
const member = { tenantId: TENANT, role: "owner", facts: {} };

const req = () =>
  new Request(`http://app.test/api/v1/ask/stop?workspace=harbor`, {
    method: "POST",
    headers: { cookie: "sb=session" },
  });

/**
 * A workspace with two sequences sending and replies going out on their own. `faults` makes a write fail the way
 * PostgREST fails (_fake-db.mjs), read when the write is made, so a test may lift it between two presses.
 */
const world = (faults = {}) => {
  const tables = {
    tenants: [{ id: TENANT, slug: "harbor", name: "Harbor Studio", status: "active", sending_stopped_at: null }],
    tenant_config: [{ tenant_id: TENANT, config: {}, version: 1 }],
    sequence_steps: [WIN_BACK, REMINDER].map((id) => ({
      id,
      tenant_id: TENANT,
      state: "running",
      after_step_id: null,
    })),
    policies: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        tenant_id: TENANT,
        class: "reply",
        mode: "auto",
        subject_type: null,
        subject_id: null,
        limits: {},
        updated_at: "2026-11-01T00:00:00Z",
      },
    ],
  };
  setServiceClient(fakeDb(tables, faults));
  return { tables, ctx: { supabase: fakeDb(tables), userId: USER, params: {} } };
};

/** What the stop keeps for Resume. */
const recordOf = (tables) => tables.tenant_config[0].config.ask?.stopped ?? null;
const stateOf = (tables, id) => tables.sequence_steps.find((s) => s.id === id).state;
/** The stop itself, as the workspace's row keeps it: when it was written, or null. */
const stopOf = (tables) => tables.tenants[0].sending_stopped_at;

/**
 * Each door as it answers: a sequence's PUT moves its row (or is refused, for the ids in `refuse`), the reply row's PUT
 * moves its mode (or is refused, when `refuse` holds "policies").
 */
let refuse;
let tables;
/** The stop as the workspace's row held it at each door's press, in order: what was written before each pause and put back. */
let stopAtEachDoor;
const realFetch = globalThis.fetch;
beforeEach(() => {
  refuse = new Set();
  stopAtEachDoor = [];
  globalThis.fetch = async (url, init) => {
    const where = new URL(String(url)).pathname.replace("/api/v1/", "");
    const body = JSON.parse(init.body);
    const [door, id] = where.split("/");
    stopAtEachDoor.push(tables.tenants?.[0]?.sending_stopped_at ?? null);
    if (refuse.has(id ?? door))
      return new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "no" } }), { status: 500 });
    if (door === "playbooks") tables.sequence_steps.find((s) => s.id === id).state = body.state;
    if (door === "policies") tables.policies.find((p) => p.class === body.class).mode = body.mode;
    return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  setServiceClient(null);
});

test("the stop is written first: before any sequence is paused, the send door already holds what goes out on its own", async () => {
  const w = world();
  tables = w.tables;
  const a = await stopEverything(w.ctx, req(), member);
  assert.ok(stopOf(tables), "the workspace's row says sending is stopped");
  assert.equal(stopOf(tables), recordOf(tables).at, "from the moment the record keeps");
  assert.ok(stopAtEachDoor.length > 0 && stopAtEachDoor.every(Boolean), "written before the first pause");
  assert.equal(a.stopped, true);
});

test("a press that dies in the clean-up leaves a stop the page shows: its record is kept the moment the stop is written", async () => {
  const w = world();
  tables = w.tables;
  // The sequences cannot be listed, so the press fails after the stop is written and before anything is paused.
  const dying = {
    ...w.ctx,
    supabase: fakeDb(tables, { "sequence_steps.select": { message: "the database is busy" } }),
  };
  await assert.rejects(() => stopEverything(dying, req(), member));
  assert.ok(stopOf(tables), "the stop stands: the send door holds what goes out on its own");
  assert.deepEqual(
    recordOf(tables),
    { at: stopOf(tables), playbooks: [], reply: null },
    "and the page and Ask say so, with Resume there to lift it",
  );
  const a = await resumeEverything(w.ctx, req(), member);
  assert.equal(a.stopped, false);
  assert.equal(stopOf(tables), null, "Resume lifts it");
  assert.equal(recordOf(tables), null);
});

test("a pause that fails: the stop holds it all the same, so the answer says stopped, and the leftover is logged", async () => {
  const w = world();
  tables = w.tables;
  refuse.add(REMINDER);
  const { result: a, lines } = await linesOf(() => stopEverything(w.ctx, req(), member));
  assert.equal(a.stopped, true, "nothing it sends leaves: the door holds it");
  assert.equal(a.left, 1, "one sequence still shows as running");
  assert.equal(a.paused, 1);
  assert.equal(stateOf(tables, REMINDER), "running");
  assert.deepEqual(recordOf(tables).playbooks, [WIN_BACK], "the record holds only what the stop paused, for Resume");
  assert.equal(recordOf(tables).left, undefined, "and nothing the page would say still sends");
  const said = lines.find((l) => l.event === "ask_stop_left");
  assert.ok(said, "the clean-up that could not finish is logged");
  assert.equal(said.left, 1);
  assert.equal(said.tenant_id, TENANT);
});

test("on a database the stop's column has not reached, a pause that fails: never stopped, what still sends is named, and logged", async () => {
  await withoutColumns({ tenants: ["sending_stopped_at"] }, async () => {
    const w = world();
    tables = w.tables;
    delete tables.tenants[0].sending_stopped_at;
    refuse.add(REMINDER);
    const { result: a, lines } = await linesOf(() => stopEverything(w.ctx, req(), member));
    assert.equal(a.stopped, false, "something it tried to pause still sends");
    assert.equal(a.left, 1, "one sequence still sending");
    assert.equal(a.replies, true, "replies wait for a person");
    assert.deepEqual(recordOf(tables).left, [REMINDER], "what it could not, for the page to say");
    assert.equal(recordOf(tables).reply, "auto", "what replies go back to");
    assert.ok(lines.some((l) => l.event === "ask_stop_left" && l.left === 1));
  });
});

test("a stop that cannot be written: logged, and the stop is what the pauses make it, as before the column", async () => {
  const w = world({ "tenants.update": { message: "the database is busy" } });
  tables = w.tables;
  const { result: a } = await linesOf(() => stopEverything(w.ctx, req(), member));
  assert.equal(stopOf(tables), null, "the row is as it was");
  assert.equal(a.stopped, true, "every sequence paused and replies held: stopped, as Stop everything always meant");
  assert.equal(stateOf(tables, WIN_BACK), "paused");
  assert.equal(stateOf(tables, REMINDER), "paused");
});

test("pressed again, it looks again: what still sends is paused, added to the record, and then it says stopped", async () => {
  const w = world();
  tables = w.tables;
  refuse.add(REMINDER);
  await linesOf(() => stopEverything(w.ctx, req(), member));
  refuse.clear();
  const a = await stopEverything(w.ctx, req(), member);
  assert.equal(stateOf(tables, REMINDER), "paused", "the second press paused it");
  assert.equal(a.stopped, true);
  assert.equal(a.left, 0);
  assert.equal(a.paused, 2);
  assert.equal(a.replies, true);
  assert.deepEqual([...recordOf(tables).playbooks].sort(), [WIN_BACK, REMINDER].sort(), "the record holds both");
  assert.deepEqual(recordOf(tables).left ?? [], [], "nothing left");
  assert.equal(recordOf(tables).reply, "auto", "replies still go back to what they were before the stop");
});

test("replies whose row could not be set: stopped all the same, since the receptionist asks a person while it stands; a second press sets the row", async () => {
  const w = world();
  tables = w.tables;
  refuse.add("policies");
  const { result: a } = await linesOf(() => stopEverything(w.ctx, req(), member));
  assert.equal(a.stopped, true);
  assert.equal(a.replies, false, "the Replies row still says what it said");
  assert.equal(a.left, 0);
  assert.notEqual(recordOf(tables).replies_left, true, "nothing the page would say goes out on its own");
  refuse.clear();
  const b = await stopEverything(w.ctx, req(), member);
  assert.equal(b.stopped, true);
  assert.equal(b.replies, true);
  assert.equal(tables.policies[0].mode, "ask");
  assert.equal(recordOf(tables).reply, "auto", "what they go back to");
  assert.notEqual(recordOf(tables).replies_left, true);
});

test("a sequence a member paused by hand is never in the record", async () => {
  const w = world();
  tables = w.tables;
  tables.sequence_steps[1].state = "paused";
  const a = await stopEverything(w.ctx, req(), member);
  assert.equal(a.stopped, true);
  assert.deepEqual(recordOf(tables).playbooks, [WIN_BACK]);
});

test("a resume that fails for one: the record keeps it, the answer says it is still paused, and a second resume clears it", async () => {
  const w = world();
  tables = w.tables;
  await stopEverything(w.ctx, req(), member);
  refuse.add(REMINDER);
  stopAtEachDoor = [];
  const { result: a, lines } = await linesOf(() => resumeEverything(w.ctx, req(), member));
  assert.ok(stopAtEachDoor.every(Boolean), "what the stop paused is put back while the stop still stands");
  assert.equal(
    stopOf(tables),
    null,
    "then the stop is lifted, whatever did not come back: that one is paused by its own row",
  );
  assert.equal(stateOf(tables, WIN_BACK), "running", "what came back came back");
  assert.equal(stateOf(tables, REMINDER), "paused");
  assert.equal(tables.policies[0].mode, "auto", "replies are back as they were");
  assert.equal(a.stopped, true, "not everything came back");
  assert.equal(a.paused, 1, "one is still paused");
  assert.equal(a.replies, false, "replies no longer wait");
  assert.deepEqual(recordOf(tables).playbooks, [REMINDER], "the record keeps what did not come back");
  assert.equal(recordOf(tables).reply, null, "and nothing of replies, which are back");
  assert.ok(lines.some((l) => l.event === "ask_resume_left" && l.left === 1));
  refuse.clear();
  const b = await resumeEverything(w.ctx, req(), member);
  assert.equal(stateOf(tables, REMINDER), "running");
  assert.equal(b.stopped, false);
  assert.equal(b.paused, 0);
  assert.equal(recordOf(tables), null, "cleared once everything came back");
});

test("replies that could not be put back: the record keeps them, and a second resume puts them back", async () => {
  const w = world();
  tables = w.tables;
  await stopEverything(w.ctx, req(), member);
  refuse.add("policies");
  const { result: a } = await linesOf(() => resumeEverything(w.ctx, req(), member));
  assert.equal(a.stopped, true);
  assert.equal(a.paused, 0);
  assert.equal(a.replies, true, "replies still wait for a person");
  assert.equal(recordOf(tables).reply, "auto");
  refuse.clear();
  const b = await resumeEverything(w.ctx, req(), member);
  assert.equal(b.stopped, false);
  assert.equal(tables.policies[0].mode, "auto");
  assert.equal(recordOf(tables), null);
});

test("a Resume lifts the stop even where its record was never written (the press that wrote the stop failed after it)", async () => {
  const w = world();
  tables = w.tables;
  tables.tenants[0].sending_stopped_at = "2026-11-13T10:00:00.000Z";
  const a = await resumeEverything(w.ctx, req(), member);
  assert.equal(a.stopped, false);
  assert.equal(stopOf(tables), null);
});

test("a stop that cannot be lifted fails the Resume, never says it is back, keeps the record, and a second Resume lifts it", async () => {
  const faults = {};
  const w = world(faults);
  tables = w.tables;
  await stopEverything(w.ctx, req(), member);
  const kept = recordOf(tables);
  faults["tenants.update"] = { message: "the database is busy" };
  await assert.rejects(resumeEverything(w.ctx, req(), member));
  assert.ok(stopOf(tables), "still stopped");
  assert.deepEqual(recordOf(tables), kept, "the record as it was, so the next Resume puts the same back");
  delete faults["tenants.update"];
  const b = await resumeEverything(w.ctx, req(), member);
  assert.equal(b.stopped, false);
  assert.equal(stopOf(tables), null);
  assert.equal(recordOf(tables), null);
});

const { stopLineOf, stopSaid, stoppedAdsLineOf } = await import(
  at("apps/dashboard/src/surfaces/settings/autonomy/stop-words.ts")
);
/** A press's answer with no ad to speak of. */
const NO_ADS = { paused: 0, still_on: 0, in_meta: 0, waiting: [] };

test("Settings › Autonomy never says paused while something still goes out: what, that pressing again tries again, and the other way", () => {
  const stopped = { at: "2026-11-13T10:00:00Z", playbooks: [WIN_BACK], reply: "auto" };
  assert.deepEqual(stopLineOf(null), {
    label: "All sending",
    hint: "Pauses every send and holds replies for you, at once.",
    press: "stop",
  });
  assert.deepEqual(stopLineOf(stopped), {
    label: "Everything is paused",
    hint: "Nothing goes out on its own until you resume. Your own replies still send.",
    press: "resume",
  });
  assert.deepEqual(stopLineOf({ ...stopped, left: [REMINDER] }), {
    label: "Not everything stopped",
    hint: "1 sequence is still sending. Press Stop everything again to try again, or pause it on Campaigns.",
    press: "stop",
  });
  assert.deepEqual(stopLineOf({ ...stopped, reply: null, left: [REMINDER, WIN_BACK], replies_left: true }), {
    label: "Not everything stopped",
    hint: "2 sequences are still sending, and replies still go out on their own. Press Stop everything again to try again, or pause them on Campaigns and set Replies above to Asks you.",
    press: "stop",
  });
  assert.deepEqual(stopLineOf({ ...stopped, reply: null, resumed_at: "2026-11-13T11:00:00Z" }), {
    label: "Not everything came back",
    hint: "1 sequence is still paused. Press Resume again to try again, or start it on Campaigns.",
    press: "resume",
  });
});

test("what a press says, from its answer: done, or what it could not do and the way to it", () => {
  assert.deepEqual(stopSaid("stop", { stopped: true, paused: 2, replies: true, left: 0, ads: NO_ADS }), {
    words: "Everything is paused. Nothing goes out on its own.",
    warn: false,
  });
  assert.deepEqual(stopSaid("stop", { stopped: false, paused: 0, replies: false, left: 0, ads: NO_ADS }), {
    words:
      "Not everything stopped. Replies still go out on their own. Press Stop everything again to try again, or set Replies above to Asks you.",
    warn: true,
  });
  assert.deepEqual(stopSaid("resume", { stopped: false, paused: 0, replies: false, left: 0, ads: NO_ADS }), {
    words: "Back as it was.",
    warn: false,
  });
  assert.deepEqual(stopSaid("resume", { stopped: true, paused: 2, replies: true, left: 0, ads: NO_ADS }), {
    words:
      "Not everything came back. 2 sequences are still paused, and replies still wait for you. Press Resume again to try again, or start them on Campaigns and set Replies above as you had them.",
    warn: true,
  });
});

test("what a press says of the ads: the stop paused the ones made here; one made in Meta is still on; Resume turns none on", () => {
  const stopped = { stopped: true, paused: 0, replies: true, left: 0 };
  assert.deepEqual(stopSaid("stop", { ...stopped, ads: { ...NO_ADS, paused: 2, in_meta: 1 } }), {
    words:
      "Everything is paused. Nothing goes out on its own. It paused 2 ads made here. 1 ad made in Meta is still on: pause it on Ads.",
    warn: true,
  });
  assert.equal(
    stopSaid("stop", { ...stopped, ads: { ...NO_ADS, still_on: 2 } }).words,
    "Everything is paused. Nothing goes out on its own. 2 ads are still on: pause them on Ads.",
    "where the pause of the ads made here did not hold, they are said as still on",
  );
  const waiting = [
    { id: "a1", name: "First visit", version: 4 },
    { id: "a2", name: "Consultation", version: 4 },
  ];
  assert.deepEqual(
    stopSaid("resume", { stopped: false, paused: 0, replies: false, left: 0, ads: { ...NO_ADS, waiting } }),
    {
      words: "Back as it was. 2 ads were paused with it, and stay paused.",
      warn: false,
    },
  );
  assert.deepEqual(stoppedAdsLineOf(waiting), {
    hint: "2 ads made here were paused with Stop everything, and stay paused until you turn them back on.",
    press: "Turn 2 back on",
  });
  assert.equal(stoppedAdsLineOf([]), null);
});
