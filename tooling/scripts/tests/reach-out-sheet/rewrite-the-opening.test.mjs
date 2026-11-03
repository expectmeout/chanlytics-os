/**
 * Rewrite the opening as its owner says (3 Nov 2026, 00505), through the dashboard's routes: what should change goes to
 * the one door with the rewrite (and only with words, so a database from before it answers every other press); the
 * check route asks the edge's check of those emails now (/api/admin/reach-out/check) and answers the openings they
 * stand with, as one answer or as a stream of the check's steps, said as still being written where the edge could not;
 * and Undo goes to its own door. Run through route() with the production guard open (EDGE_PROVIDERS=live) onto a fake
 * edge, over a database in memory.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { REACH_OUT_REFUSALS, REWRITE_NOW_MAX } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The guard is read once, as its module loads: open it before the routes are imported.
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "https://edge.example";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const decide = await import(at("apps/dashboard/app/api/v1/reach-out-sends/[id]/decide/route.ts"));
const check = await import(at("apps/dashboard/app/api/v1/reach-out-sends/check/route.ts"));
const undo = await import(at("apps/dashboard/app/api/v1/reach-out-sends/[id]/undo-rewrite/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const RUN = "55555555-5555-4555-8555-555555555555";
const SEND = "66666666-6666-4666-8666-666666666666";
const OTHER = "67676767-6767-4767-8767-676767676767";
const LEAD = "77777777-7777-4777-8777-777777777777";
const STEP = "88888888-8888-4888-8888-888888888888";
const SEQ = "99999999-9999-4999-8999-999999999999";

/** The email, as the check left it once the edge wrote it: its new opening, read, and the one it replaced kept. */
const written = (over = {}) => ({
  id: SEND,
  tenant_id: A,
  sequence_id: SEQ,
  step_id: STEP,
  batch_id: RUN,
  lead_id: LEAD,
  state: "planned",
  reason: null,
  opening: "Harbor Movers opens at 7 on weekdays.",
  checked_at: "2026-11-03T05:55:00.000Z",
  rewrite_asked: { change: "Shorter", by: USER, at: "2026-11-03T05:54:23.000Z", was: { opening: "Old." } },
  ...over,
});
const world = (send, stepState = "running") => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  billing_accounts: [{ tenant_id: A, mode: "direct", status: "active" }],
  sequence_sends: [send],
  sequence_steps: [
    { id: SEQ, tenant_id: A, state: "running" },
    { id: STEP, tenant_id: A, state: stepState },
  ],
});
const asked = [];
const rpcs = {
  reach_out_send_decide: (a) => (asked.push(a), { send_id: a.p_send_id, decision: a.p_decision }),
  reach_out_send_rewrite_undo: (a) => (asked.push(a), { send_id: a.p_send_id, opening: "Old.", state: "held" }),
};
const press = (route, body, w = world(written()), id = SEND) =>
  route.POST.run(
    new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: JSON.stringify(body) }),
    { supabase: fakeDb(w, {}, rpcs), userId: USER, email: "ada@example.com", params: { id } },
  );

/** The edge: what it answers (one JSON answer, or the lines of a stream), and every call it received. */
const edge = { calls: [], lines: [], down: false };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  edge.calls.push({ url: String(url), body });
  if (edge.down) throw new TypeError("fetch failed");
  if (body.stream)
    return new Response(edge.lines.map((l) => JSON.stringify(l)).join("\n") + "\n", {
      status: 200,
      headers: { "content-type": "application/x-ndjson" },
    });
  return new Response(JSON.stringify({ ok: true, read: 1, checked: 1, held: 0 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const ledger = { events: [] };
beforeEach(() => {
  setRateStore(memoryStore());
  edge.calls.length = 0;
  edge.lines = [];
  edge.down = false;
  asked.length = 0;
  ledger.events = [];
  setServiceClient(fakeDb(ledger));
});
after(() => {
  globalThis.fetch = realFetch;
  setServiceClient(null);
});

/** A streamed answer, line by line. */
const linesOf = async (res) =>
  (await res.text())
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

test("a rewrite's decision takes what should change to the door, and asks nothing of the edge", async () => {
  assert.deepEqual(await press(decide, { decision: "rewrite", change: "  Shorter  " }), {
    send_id: SEND,
    decision: "rewrite",
  });
  assert.deepEqual(await press(decide, { decision: "rewrite" }), { send_id: SEND, decision: "rewrite" });
  assert.deepEqual(await press(decide, { decision: "skip" }), { send_id: SEND, decision: "skip" });
  assert.deepEqual(asked, [
    { p_send_id: SEND, p_decision: "rewrite", p_change: "Shorter" },
    { p_send_id: SEND, p_decision: "rewrite" },
    { p_send_id: SEND, p_decision: "skip" },
  ]);
  assert.equal(edge.calls.length, 0, "the decision writes nothing itself: the check route does");
  assert.deepEqual(ledger.events.map((e) => [e.kind, e.subject_id, e.data]).slice(0, 1), [
    ["reach_out.send_decided", RUN, { decision: "rewrite", by: USER }],
  ]);
});

test("words go with a rewrite alone, and at most 280 characters of them", async () => {
  for (const body of [
    { decision: "skip", change: "Shorter" },
    { decision: "rewrite", change: "x".repeat(281) },
  ])
    await assert.rejects(press(decide, body), (e) => e.code === "validation" && e.status === 400, JSON.stringify(body));
  assert.equal(asked.length, 0, "nothing reached the door");
});

test("the check, pressed: the edge checks those emails now, and the openings they stand with come back", async () => {
  const out = await press(check, { send_ids: [SEND] });
  assert.deepEqual(
    edge.calls,
    [{ url: "https://edge.example/api/admin/reach-out/check", body: { send_ids: [SEND] } }],
    "the edge's check, asked for these emails alone",
  );
  assert.deepEqual(out, {
    sends: [
      {
        send_id: SEND,
        opening: "Harbor Movers opens at 7 on weekdays.",
        written: true,
        held: null,
        paused: false,
        undo: true,
      },
    ],
  });
  // Held again by the check: said so, and Undo still stands.
  const held = await press(check, { send_ids: [SEND] }, world(written({ state: "held", reason: "unbacked_fact" })));
  assert.equal(held.sends[0].held, "unbacked_fact");
  assert.equal(held.sends[0].undo, true);
});

test("an edge that could not check them leaves them to the clock: still being written, or waiting on a paused sequence", async () => {
  edge.down = true;
  const unwritten = written({ opening: null, checked_at: null, rewrite_asked: { was: { opening: "Old." } } });
  const out = await press(check, { send_ids: [SEND] }, world(unwritten));
  assert.equal(edge.calls.length, 1);
  assert.deepEqual(out.sends, [
    { send_id: SEND, opening: null, written: false, held: null, paused: false, undo: true },
  ]);
  const paused = await press(check, { send_ids: [SEND] }, world(unwritten, "paused"));
  assert.equal(paused.sends[0].paused, true, "its step is paused: written again once the sequence runs");
});

test("as a stream: each step of these emails as the edge takes it, then how they stand; another's step or an unknown one is dropped", async () => {
  edge.lines = [
    { t: "step", send_id: SEND, step: "reading" },
    { t: "step", send_id: OTHER, step: "writing" },
    { t: "step", send_id: SEND, step: "guessing" },
    { t: "step", send_id: SEND, step: "writing" },
    { t: "step", send_id: SEND, step: "checking" },
    { t: "done", read: 1, checked: 1, held: 0 },
  ];
  const res = await press(check, { send_ids: [SEND], stream: true });
  assert.equal(res.headers.get("content-type"), "application/x-ndjson");
  assert.deepEqual(edge.calls[0].body, { send_ids: [SEND], stream: true });
  const lines = await linesOf(res);
  assert.deepEqual(
    lines.filter((l) => l.t === "step"),
    [
      { t: "step", send_id: SEND, step: "reading" },
      { t: "step", send_id: SEND, step: "writing" },
      { t: "step", send_id: SEND, step: "checking" },
    ],
  );
  assert.equal(lines.at(-1).t, "done");
  assert.equal(lines.at(-1).sends[0].opening, "Harbor Movers opens at 7 on weekdays.");
  // An edge that could not be asked: no step, and the answer still says how it stands.
  edge.down = true;
  const after = await linesOf(await press(check, { send_ids: [SEND], stream: true }));
  assert.deepEqual(
    after.map((l) => l.t),
    ["done"],
  );
  assert.equal(after[0].sends[0].send_id, SEND);
});

test("the check takes one to twenty email ids, and reads no other workspace's email", async () => {
  const many = Array.from(
    { length: REWRITE_NOW_MAX + 1 },
    (_, i) => `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`,
  );
  for (const body of [{ send_ids: [] }, { send_ids: many }, { send_ids: ["not-an-id"] }, {}])
    await assert.rejects(press(check, body), (e) => e.code === "validation" && e.status === 400, JSON.stringify(body));
  assert.equal(edge.calls.length, 0, "nothing asked of the edge");
  const theirs = await press(check, { send_ids: [SEND] }, world(written({ tenant_id: B })));
  assert.deepEqual(theirs.sends, [], "another workspace's email is not read");
});

test("Undo goes to its own door and answers the opening the email stands with now; a refusal is said in its words", async () => {
  const out = await press(
    undo,
    {},
    world(written({ opening: "Old.", state: "held", reason: "unbacked_fact", rewrite_asked: null })),
  );
  assert.deepEqual(asked, [{ p_send_id: SEND }]);
  assert.deepEqual(out, {
    send_id: SEND,
    rewritten: { send_id: SEND, opening: "Old.", written: true, held: "unbacked_fact", paused: false, undo: false },
  });
  assert.deepEqual(
    ledger.events.map((e) => [e.kind, e.data]),
    [["reach_out.send_decided", { decision: "rewrite_undone", by: USER }]],
  );
  const refusing = {
    ...rpcs,
    reach_out_send_rewrite_undo: () => {
      throw Object.assign(new Error(REACH_OUT_REFUSALS.nothingToUndo), { code: "22023" });
    },
  };
  await assert.rejects(
    undo.POST.run(new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: "{}" }), {
      supabase: fakeDb(world(written()), {}, refusing),
      userId: USER,
      email: "ada@example.com",
      params: { id: SEND },
    }),
    (e) => e.code === "validation" && e.status === 422 && e.message === REACH_OUT_REFUSALS.nothingToUndo,
  );
});
