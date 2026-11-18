/**
 * A call to a lead's own preview, read back (decision 0079; the redesign of 17 November 2026): the words said on it and
 * what the business would get after a real one, at its three layers, each run for real:
 *
 *   - the dashboard's server/previews/heard.ts: a rehearsal's turns as the call's lines (tools and empty turns left
 *     out), and a call's analysis as the card its Inbox would hold, in the words every surface says a call in;
 *   - the edge's door (apps/edge/lib/previews/after-call.ts), over a database in memory with the provider answered by
 *     the test: a call still running or not yet written up is being written, an analysed one is ready with its
 *     fields, and one there is nothing to come for is none; a rehearsal is its own workspace's;
 *   - the page's door (app/api/v1/previews/[token]/heard), run as Next runs it, its knock on the edge answered by the
 *     edge's own function: the words so far while a call runs (the edge is not asked), the card once it is written,
 *     a write-up waited for two minutes and the provider asked no longer, an edge deployed before this door read as none,
 *     a call found in the preview's own workspace alone, and a bucket of its own.
 *
 * Made-up businesses only.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { CALL_OUTCOME_WORDS, LEAD_PREVIEW_WORDS as W } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const ENV = {
  EDGE_URL: "https://edge.example.com",
  EDGE_CALL_SECRET: "edge-secret-for-this-file",
  RETELL_API_KEY: "key_made_up_for_this_file",
};
const was = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
Object.assign(process.env, ENV, {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:1",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-only",
});
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/shared/service-db.ts");
const heardDoor = await importSrc("apps/dashboard/app/api/v1/previews/[token]/heard/route.ts");
const { WRITE_UP_MS, previewGotOf, previewHeardOf } = await importSrc("apps/dashboard/src/server/previews/heard.ts");
const { setPg } = await importSrc("apps/edge/lib/shared/pg.ts");
const { previewAfterCall } = await importSrc("apps/edge/lib/previews/after-call.ts");
after(() => {
  setPg(null);
  setServiceClient(null);
});

const OURS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CALL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const THEIRS = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const TOKEN = "TokenTokenTokenToken01";
const RETELL = "https://api.retellai.com";
const DAY_MS = 86_400_000;
const FUTURE = new Date(Date.now() + 10 * DAY_MS).toISOString();
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const TURNS = [
  { role: "agent", content: "Thanks for calling Fixture Plumbing. How can I help?" },
  { role: "user", content: "My water heater is leaking.\n Can someone come out today?" },
  { role: "tool", content: "send_booking_link" },
  { role: "agent", content: "  " },
  { role: "agent", content: "I'll make sure someone calls you back about a time today." },
];
const LINES = [
  { who: "ai", text: "Thanks for calling Fixture Plumbing. How can I help?" },
  { who: "you", text: "My water heater is leaking. Can someone come out today?" },
  { who: "ai", text: "I'll make sure someone calls you back about a time today." },
];
const ANALYSIS = {
  call_summary: "The user called Fixture Plumbing to report a leaking water heater. A callback was promised.",
  custom_analysis_data: {
    caller_wanted: "Has a leaking water heater and wants someone out today.",
    outcome: "callback_needed",
    follow_up: "Call Dan back about a time today.",
    caller_name: "Dan",
    caller_email: "",
  },
};
const CARD = {
  outcome: CALL_OUTCOME_WORDS.callback_needed,
  yours: true,
  wanted: "Has a leaking water heater and wants someone out today.",
  notes: ["To do: Call Dan back about a time today.", "Gave their name as Dan"],
};

/** What the provider was asked, and how it answers a read of a call. */
let retellAsked = [];
let retellAnswers = () => [200, { call_id: "call_1", call_status: "ended", call_analysis: ANALYSIS }];
/** What the edge was asked by the dashboard, and whether it has this door yet. */
let edgeAsked = [];
let edgeHasDoor = true;

/** The preview's row on the sender's workspace, and the calls made to its own. */
function world({ preview = {}, rehearsals = [] } = {}) {
  const tables = {
    lead_previews: [
      {
        id: "p1",
        tenant_id: OURS,
        lead_id: "l1",
        preview_tenant_id: WS,
        token: TOKEN,
        state: "ready",
        ends_at: FUTURE,
        asked_count: 0,
        opened_count: 0,
        turns: [],
        not_right: [],
        ...preview,
      },
    ],
    rehearsals: rehearsals.map((row) => ({
      id: CALL,
      tenant_id: WS,
      kind: "call",
      retell_call_id: "call_1",
      transcript: TURNS,
      started_at: ago(120_000),
      ended_at: null,
      seconds: null,
      created_at: ago(125_000),
      ...row,
    })),
  };
  const db = fakeDb(tables, {}, {});
  setServiceClient(db);
  setPg(db);
  return tables;
}

beforeEach(() => {
  setRateStore(memoryStore());
  retellAsked = [];
  edgeAsked = [];
  edgeHasDoor = true;
  retellAnswers = () => [200, { call_id: "call_1", call_status: "ended", call_analysis: ANALYSIS }];
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    if (address.startsWith(RETELL)) {
      retellAsked.push(address.slice(RETELL.length));
      const [status, body] = retellAnswers();
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }
    if (address.endsWith("/api/admin/previews/after-call")) {
      const body = JSON.parse(init.body);
      edgeAsked.push(body);
      // An edge deployed before this door has no function at the path.
      if (!edgeHasDoor) return new Response("Not Found", { status: 404 });
      // The edge's own answer, for the workspace the dashboard's token names.
      return previewAfterCall({ ok: true, via: "token", workspace: body.tenant_id, user: null }, body);
    }
    throw new Error(`a fetch this file does not answer: ${address}`);
  };
});

const post = (body, { token = TOKEN, site = "same-origin", ip = "203.0.113.7" } = {}) =>
  heardDoor.POST(
    new Request(`http://localhost/api/v1/previews/${token}/heard`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": site, "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token }) },
  );
const read = async (res) => ({ status: res.status, body: await res.json() });
const knock = (body, workspace = WS) =>
  previewAfterCall({ ok: true, via: "token", workspace, user: null }, body).then(async (res) => [
    res.status,
    await res.json(),
  ]);

/* ------------------------------------------------------------------ the lines and the card */

test("a rehearsal's turns are the call's lines: who said each, a tool and a turn with no words left out", () => {
  assert.deepEqual(previewHeardOf(TURNS), LINES);
  assert.deepEqual(previewHeardOf([]), []);
});

test("a call's analysis is the card an Inbox would hold: how it ended, what the caller wanted, the to-do and what they gave", () => {
  const analysis = {
    outcome: "callback_needed",
    wanted: "Has a leaking water heater and wants someone out today.",
    summary: "The user called Fixture Plumbing to report a leaking water heater. A callback was promised.",
    follow_up: "Call Dan back about a time today.",
    caller_name: "Dan",
    caller_email: null,
  };
  assert.deepEqual(previewGotOf(analysis), CARD);

  // No sentence of what they wanted: the provider's summary's first, its opening folded as every surface folds it.
  assert.deepEqual(
    previewGotOf({ ...analysis, wanted: null, follow_up: null, caller_name: null, outcome: "answered" }),
    {
      outcome: CALL_OUTCOME_WORDS.answered,
      yours: false,
      wanted: "Called to report a leaking water heater.",
      notes: [],
    },
  );
  // A to-do makes it theirs whatever the outcome says, and an outcome outside the six is not said.
  const odd = previewGotOf({ ...analysis, outcome: "resolved_by_magic" });
  assert.deepEqual([odd.outcome, odd.yours], [null, true]);
  // A to-do with no sentence of what was wanted says its notes alone, never that there is nothing to do.
  assert.deepEqual(previewGotOf({ ...analysis, wanted: null, summary: null }), { ...CARD, wanted: "" });
});

test("a call nobody asked anything on says so; an analysis with nothing in it is no card", () => {
  const nothing = {
    outcome: null,
    wanted: null,
    summary: null,
    follow_up: null,
    caller_name: null,
    caller_email: null,
  };
  assert.equal(previewGotOf(nothing), null);
  assert.equal(previewGotOf({ ...nothing, outcome: "answered" }), null);
  assert.deepEqual(previewGotOf({ ...nothing, outcome: "no_request" }), {
    outcome: CALL_OUTCOME_WORDS.no_request,
    yours: false,
    wanted: W.gotNothing,
    notes: [],
  });
});

/* ------------------------------------------------------------------ the edge's door */

test("the edge: a call still running is being written, and the provider is not asked", async () => {
  world({ rehearsals: [{}] });
  const [status, body] = await knock({ tenant_id: WS, rehearsal_id: CALL });
  assert.deepEqual([status, body.ok, body.state], [200, true, "writing"]);
  assert.deepEqual(retellAsked, []);
});

test("the edge: an ended call the provider has analysed is ready, with the fields a real call's card reads", async () => {
  world({ rehearsals: [{ ended_at: ago(5_000), seconds: 72 }] });
  const [status, body] = await knock({ tenant_id: WS, rehearsal_id: CALL });
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ok: true,
    state: "ready",
    outcome: "callback_needed",
    wanted: "Has a leaking water heater and wants someone out today.",
    summary: "The user called Fixture Plumbing to report a leaking water heater. A callback was promised.",
    follow_up: "Call Dan back about a time today.",
    caller_name: "Dan",
    caller_email: null,
  });
  assert.deepEqual(retellAsked, ["/v2/get-call/call_1"]);
});

test("the edge: not analysed yet, or not answering just now, is being written; no record of it, or a typed one, is none", async () => {
  world({ rehearsals: [{ ended_at: ago(2_000) }] });
  retellAnswers = () => [200, { call_id: "call_1", call_status: "ended" }];
  assert.equal((await knock({ tenant_id: WS, rehearsal_id: CALL }))[1].state, "writing");
  retellAnswers = () => [429, { error: "slow down" }];
  assert.equal((await knock({ tenant_id: WS, rehearsal_id: CALL }))[1].state, "writing");
  retellAnswers = () => [404, { error: "no such call" }];
  assert.equal((await knock({ tenant_id: WS, rehearsal_id: CALL }))[1].state, "none");

  world({ rehearsals: [{ kind: "typed", retell_call_id: null, ended_at: ago(2_000) }] });
  retellAsked = [];
  assert.equal((await knock({ tenant_id: WS, rehearsal_id: CALL }))[1].state, "none");
  assert.deepEqual(retellAsked, [], "a typed rehearsal has no call to ask the provider for");
});

test("the edge: a rehearsal is its own workspace's, and the knock names the workspace it reads", async () => {
  world({ rehearsals: [{ id: THEIRS, tenant_id: OTHER, ended_at: ago(2_000) }] });
  assert.deepEqual((await knock({ tenant_id: WS, rehearsal_id: THEIRS })).slice(0, 1), [404]);
  const [status, body] = await knock({ tenant_id: OTHER, rehearsal_id: THEIRS });
  assert.deepEqual([status, body.error], [403, "workspace_mismatch"]);
  assert.equal((await knock({ tenant_id: WS, rehearsal_id: "not-an-id" }))[0], 400);
  assert.deepEqual(retellAsked, [], "none of them reached the provider");
});

/* ------------------------------------------------------------------ the page's door */

test("while a call runs: its words so far, not ended, and the edge is not asked", async () => {
  world({ rehearsals: [{}] });
  const r = await read(await post({ call: CALL }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.data, { lines: LINES, ended: false, got: null, writing: true });
  assert.deepEqual(edgeAsked, []);
});

test("once it has ended and is written up: its words whole and the card, asked of the edge for the preview's workspace", async () => {
  world({ rehearsals: [{ ended_at: ago(5_000), seconds: 72 }] });
  const r = await read(await post({ call: CALL }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.data, { lines: LINES, ended: true, got: CARD, writing: false });
  assert.deepEqual(edgeAsked, [{ tenant_id: WS, rehearsal_id: CALL }]);
});

test("a write-up is waited for two minutes past the call's end; after them the provider is not asked, whatever it holds", async () => {
  retellAnswers = () => [200, { call_id: "call_1", call_status: "ended" }];
  world({ rehearsals: [{ ended_at: ago(5_000) }] });
  assert.deepEqual((await read(await post({ call: CALL }))).body.data, {
    lines: LINES,
    ended: true,
    got: null,
    writing: true,
  });
  // Past the wait, with a write-up there for the asking: the words still, and nobody asked for the rest.
  retellAnswers = () => [200, { call_id: "call_1", call_status: "ended", call_analysis: ANALYSIS }];
  world({ rehearsals: [{ ended_at: ago(WRITE_UP_MS + 5_000) }] });
  edgeAsked = [];
  retellAsked = [];
  assert.deepEqual((await read(await post({ call: CALL }))).body.data, {
    lines: LINES,
    ended: true,
    got: null,
    writing: false,
  });
  assert.deepEqual([edgeAsked, retellAsked], [[], []]);
});

test("an edge deployed before this door is no write-up: the words alone, and nothing said to have failed", async () => {
  edgeHasDoor = false;
  world({ rehearsals: [{ ended_at: ago(5_000) }] });
  const r = await read(await post({ call: CALL }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.data, { lines: LINES, ended: true, got: null, writing: false });
});

test("a preview that has said its twenty still reads its call; one that is ended, or a token that names nothing, reads none", async () => {
  world({ preview: { asked_count: 20 }, rehearsals: [{}] });
  assert.equal((await post({ call: CALL })).status, 200);
  world({ preview: { state: "ended" }, rehearsals: [{}] });
  assert.equal((await post({ call: CALL })).status, 409);
  world({ rehearsals: [{}] });
  assert.equal((await post({ call: CALL }, { token: "NoSuchTokenNoSuchToken" })).status, 404);
});

test("a link reads its own workspace's calls alone; a name that is no call's is refused; so is a press from another site", async () => {
  world({ rehearsals: [{ id: THEIRS, tenant_id: OTHER }] });
  assert.equal((await post({ call: THEIRS })).status, 404, "another workspace's call");
  assert.equal((await post({ call: "call_1" })).status, 400, "the provider's id is not the page's name for it");
  assert.equal((await post({})).status, 400);
  world({ rehearsals: [{ kind: "typed" }] });
  assert.equal((await post({ call: CALL })).status, 404, "a typed rehearsal is no call");
  world({ rehearsals: [{}] });
  assert.equal((await post({ call: CALL }, { site: "cross-site" })).status, 403);
});

test("its reads are a bucket of their own: past a preview's forty messages an hour, a call's words are still read", async () => {
  world({ rehearsals: [{}] });
  for (let i = 0; i < 45; i++) assert.equal((await post({ call: CALL })).status, 200, `read ${i + 1}`);
});
