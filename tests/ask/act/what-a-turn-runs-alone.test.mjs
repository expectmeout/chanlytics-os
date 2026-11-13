/**
 * What a turn runs alone (server/ask/act/world.ts runAlone, D10 of the answers canvas), and what holds it back as it goes:
 * the day's limit (contracts ASK_ALONE_DAY_MAX) counts each card that ran before the next is judged; Stop everything or the
 * switch moved since the turn read them stops the rest; an act is not started without the time one call may take; and a
 * caller of the act door cannot claim an act alone. Each card's door is a request of the member's own, stood in by `fetch`.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runAlone } = await import(at("apps/dashboard/src/server/ask/act/world.ts"));
const { runAct, actOf } = await import(at("apps/dashboard/src/server/ask/act/run.ts"));
const { ASK_ALONE_DAY_MAX } = await import("@chanlytics/contracts");
const { askAloneCounts } = await import("@chanlytics/db/ask");

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EARLIER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const member = { tenantId: TENANT, role: "owner", facts: {} };
const NOW = new Date("2026-11-13T15:00:00Z");
const HOUR = 60 * 60 * 1000;
/** Time enough for every act of a turn, and too little for one (each call may take fifty seconds: run.ts). */
const plenty = () => Date.now() + 10 * 60 * 1000;
const short = () => Date.now() + 10 * 1000;

const req = () =>
  new Request(`http://app.test/api/v1/ask?workspace=harbor`, { method: "POST", headers: { cookie: "sb=session" } });

/** A note the member asked for in their own words: the kind the rows let run alone once the switch is on. */
const noteCard = (n) => ({
  id: `p-note-${n}`,
  kind: "note",
  needs: "operator",
  title: `Note ${n}`,
  summary: "Prefers mornings",
  made_at: new Date(NOW.getTime() - 60_000).toISOString(),
  undo: "Undo",
  origin: { by: "asked", strangers: false },
  payload: {
    contact_id: `1111111${n}-1111-4111-8111-111111111111`,
    who: "Priya",
    body: "Prefers mornings",
    team_only: false,
  },
});

/** A workspace with Ask on its own, which has already done `done` things alone in the last day. */
const world = (cards, done) => {
  const tables = {
    tenants: [{ id: TENANT, name: "Harbor", timezone: "UTC" }],
    tenant_config: [{ tenant_id: TENANT, version: 1, config: { ask: { alone: true } } }],
    policies: [],
    ask_messages: [{ id: MSG, thread_id: "t", tenant_id: TENANT, role: "assistant", content: { proposals: cards } }],
    ask_actions: Array.from({ length: done }, (_, i) => ({
      id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
      tenant_id: TENANT,
      user_id: USER,
      message_id: EARLIER,
      proposal_id: `p-earlier-${i}`,
      kind: "note",
      by: "row",
      origin_by: "asked",
      strangers: false,
      reason: "keep",
      state: "done",
      at: new Date(NOW.getTime() - HOUR).toISOString(),
    })),
    conversations: [],
    messages: [],
  };
  return { tables, ctx: { supabase: fakeDb(tables), userId: USER, params: {} } };
};

let calls;
/** What a door does beside answering: a teammate's press landing while the turn works. */
let meanwhile;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  meanwhile = () => {};
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method });
    meanwhile();
    return new Response(JSON.stringify({ ok: true, data: { id: `note-${calls.length}`, decision_id: "d" } }), {
      status: 200,
    });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a turn of several cards one short of the day's limit: one runs alone, and the rest ask", async () => {
  const cards = [1, 2, 3].map(noteCard);
  const { tables, ctx } = world(cards, ASK_ALONE_DAY_MAX - 1);
  const out = await runAlone(ctx, req(), member, MSG, cards, NOW, plenty());
  const ran = out.filter((p) => p.outcome);
  assert.equal(ran.length, 1, "one ran alone");
  assert.equal(ran[0].id, "p-note-1", "the first, in order");
  assert.equal(ran[0].outcome.state, "done");
  assert.deepEqual(ran[0].outcome.why, { reason: "keep", row: null });
  assert.equal(calls.length, 1, "one door was walked");
  assert.deepEqual(
    out.filter((p) => !p.outcome).map((p) => p.id),
    ["p-note-2", "p-note-3"],
    "the rest wait for a press",
  );
  assert.equal(tables.ask_actions.filter((a) => a.message_id === MSG).length, 1, "one act, one record");
});

test("well under the limit, every card of the turn runs alone", async () => {
  const cards = [1, 2, 3].map(noteCard);
  const { ctx } = world(cards, 0);
  const out = await runAlone(ctx, req(), member, MSG, cards, NOW, plenty());
  assert.equal(out.filter((p) => p.outcome?.state === "done").length, 3);
  assert.equal(calls.length, 3);
});

test("Stop everything pressed after the first card ran: the next waits for a press", async () => {
  const cards = [1, 2].map(noteCard);
  const { tables, ctx } = world(cards, 0);
  meanwhile = () => {
    tables.tenant_config[0].config = {
      ask: { alone: true, stopped: { at: new Date().toISOString(), playbooks: [], reply: null } },
    };
  };
  const out = await runAlone(ctx, req(), member, MSG, cards, NOW, plenty());
  assert.equal(calls.length, 1, "only the first ran");
  assert.equal(out[0].outcome?.state, "done");
  assert.equal(out[1].outcome, undefined, "the second waits for a press");
});

test("the switch turned off after the first card ran: the next waits for a press", async () => {
  const cards = [1, 2].map(noteCard);
  const { tables, ctx } = world(cards, 0);
  meanwhile = () => {
    tables.tenant_config[0].config = { ask: {} };
  };
  const out = await runAlone(ctx, req(), member, MSG, cards, NOW, plenty());
  assert.equal(calls.length, 1);
  assert.equal(out[1].outcome, undefined);
});

test("too little time left in the request for one call: no act alone starts, and every card can still be pressed", async () => {
  const cards = [1, 2].map(noteCard);
  const { tables, ctx } = world(cards, 0);
  const out = await runAlone(ctx, req(), member, MSG, cards, NOW, short());
  assert.equal(calls.length, 0, "nothing started");
  assert.deepEqual(
    out.map((p) => p.outcome),
    [undefined, undefined],
    "each waits for its press",
  );
  assert.equal(tables.ask_actions.filter((a) => a.message_id === MSG).length, 0);
});

test("a caller of the act door cannot claim an act alone: it is recorded as a press and not counted as Ask's own", async () => {
  const cards = [noteCard(1)];
  const { tables, ctx } = world(cards, 0);
  const said = actOf({ message_id: MSG, proposal_id: "p-note-1", by: "row" });
  assert.equal(said.by, "press");
  const a = await runAct(ctx, req(), member, said);
  assert.equal(a.ok, true);
  const kept = tables.ask_actions.filter((r) => r.message_id === MSG);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].by, "press");
  const counted = await askAloneCounts(ctx.supabase, TENANT, new Date(Date.now() + 1000));
  assert.equal(counted.today, 0, "nothing toward the day's limit");
});

test("what a browser may honestly say of a press is kept as it said it", () => {
  for (const by of ["press", "yes", "lock_screen", "mail"])
    assert.equal(actOf({ message_id: MSG, proposal_id: "p-note-1", by }).by, by);
});
