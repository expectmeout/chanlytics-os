/**
 * Stop everything (server/ask/act/stop.ts, D22 of the answers canvas) says what it could not stop, and a second press tries
 * again; Resume keeps what did not come back. Each sequence is paused through its own door, a request of the member's own,
 * so `fetch` is stood in for, as the door would answer: a pause that is refused leaves that sequence running. What is
 * proved is what the answer says, what the record keeps for Resume, and what is logged.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { linesOf } from "../../_log-lines.mjs";

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

/** A workspace with two sequences sending and replies going out on their own. */
const world = () => {
  const tables = {
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
  setServiceClient(fakeDb(tables));
  return { tables, ctx: { supabase: fakeDb(tables), userId: USER, params: {} } };
};

/** What the stop keeps for Resume. */
const recordOf = (tables) => tables.tenant_config[0].config.ask?.stopped ?? null;
const stateOf = (tables, id) => tables.sequence_steps.find((s) => s.id === id).state;

/**
 * Each door as it answers: a sequence's PUT moves its row (or is refused, for the ids in `refuse`), the reply row's PUT
 * moves its mode (or is refused, when `refuse` holds "policies").
 */
let refuse;
let tables;
const realFetch = globalThis.fetch;
beforeEach(() => {
  refuse = new Set();
  globalThis.fetch = async (url, init) => {
    const where = new URL(String(url)).pathname.replace("/api/v1/", "");
    const body = JSON.parse(init.body);
    const [door, id] = where.split("/");
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

test("a pause that fails: the answer never says stopped, it names what still sends, and it is logged", async () => {
  const w = world();
  tables = w.tables;
  refuse.add(REMINDER);
  const { result: a, lines } = await linesOf(() => stopEverything(w.ctx, req(), member));
  assert.equal(a.stopped, false, "something it tried to pause still sends");
  assert.equal(a.left, 1, "one sequence still sending");
  assert.equal(a.paused, 1);
  assert.equal(a.replies, true, "replies wait for a person");
  assert.equal(stateOf(tables, REMINDER), "running");
  assert.deepEqual(recordOf(tables).playbooks, [WIN_BACK], "the record holds only what the stop paused");
  assert.deepEqual(recordOf(tables).left, [REMINDER], "and what it could not, for the page to say");
  assert.equal(recordOf(tables).reply, "auto", "what replies go back to");
  const said = lines.find((l) => l.event === "ask_stop_left");
  assert.ok(said, "a stop that could not stop everything is logged");
  assert.equal(said.left, 1);
  assert.equal(said.tenant_id, TENANT);
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

test("replies that could not be held: not stopped, and a second press holds them", async () => {
  const w = world();
  tables = w.tables;
  refuse.add("policies");
  const { result: a } = await linesOf(() => stopEverything(w.ctx, req(), member));
  assert.equal(a.stopped, false);
  assert.equal(a.replies, false, "replies still go out on their own");
  assert.equal(a.left, 0);
  assert.equal(recordOf(tables).replies_left, true);
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
  const { result: a, lines } = await linesOf(() => resumeEverything(w.ctx, req(), member));
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

const { stopLineOf, stopSaid } = await import(at("apps/dashboard/src/surfaces/settings/autonomy/stop-words.ts"));

test("Settings › Autonomy never says paused while something still goes out: what, that pressing again tries again, and the other way", () => {
  const stopped = { at: "2026-11-13T10:00:00Z", playbooks: [WIN_BACK], reply: "auto" };
  assert.deepEqual(stopLineOf(null), {
    label: "All sending",
    hint: "Pauses every send and holds replies for you, at once.",
    press: "stop",
  });
  assert.deepEqual(stopLineOf(stopped), {
    label: "Everything is paused",
    hint: "1 paused, and replies wait for you.",
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
  assert.deepEqual(stopSaid("stop", { stopped: true, paused: 2, replies: true, left: 0 }), {
    words: "Everything is paused. Nothing goes out.",
    warn: false,
  });
  assert.deepEqual(stopSaid("stop", { stopped: false, paused: 0, replies: false, left: 0 }), {
    words:
      "Not everything stopped. Replies still go out on their own. Press Stop everything again to try again, or set Replies above to Asks you.",
    warn: true,
  });
  assert.deepEqual(stopSaid("resume", { stopped: false, paused: 0, replies: false, left: 0 }), {
    words: "Back as it was.",
    warn: false,
  });
  assert.deepEqual(stopSaid("resume", { stopped: true, paused: 2, replies: true, left: 0 }), {
    words:
      "Not everything came back. 2 sequences are still paused, and replies still wait for you. Press Resume again to try again, or start them on Campaigns and set Replies above as you had them.",
    warn: true,
  });
});
