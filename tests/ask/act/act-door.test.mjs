/**
 * A card acted on from the server (server/ask/act/run.ts, D15 of the answers canvas): read from its turn, read again for what has
 * moved, each of its spec's calls made as a request of the member's own, under the step's key, and what became of it kept on the
 * turn. The verb's own route is what a request reaches, so `fetch` is stood in for: what is proved is what goes out, in what order,
 * under which session, and what is kept.
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
const { runAct, undoAct } = await import(at("apps/dashboard/src/server/ask/act/run.ts"));

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONV = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const member = { tenantId: TENANT, role: "owner", facts: {} };
const made = new Date(Date.now() - 60_000).toISOString();

const req = () =>
  new Request(`http://app.test/api/v1/ask/act?workspace=harbor`, { method: "POST", headers: { cookie: "sb=session" } });

let calls;
let answers;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  answers = [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : null,
    });
    const next = answers.shift() ?? { status: 200, json: { ok: true, data: {} } };
    return new Response(JSON.stringify(next.json), { status: next.status });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const world = (proposals, more = {}) => {
  const tables = {
    ask_messages: [{ id: MSG, thread_id: "t", tenant_id: TENANT, role: "assistant", content: { proposals } }],
    ask_actions: [],
    conversations: [],
    messages: [],
    ...more,
  };
  return { tables, ctx: { supabase: fakeDb(tables), userId: USER, params: {} } };
};
const noteCard = (over = {}) => ({
  id: "p-note",
  kind: "note",
  needs: "operator",
  title: "A note",
  summary: "Prefers mornings",
  made_at: made,
  undo: "Undo",
  origin: { by: "asked", strangers: false },
  payload: {
    contact_id: "11111111-1111-4111-8111-111111111111",
    who: "Priya",
    body: "Prefers mornings",
    team_only: false,
  },
  ...over,
});
const replyCard = (over = {}) => ({
  id: "p-reply",
  kind: "reply",
  needs: "operator",
  title: "Reply",
  summary: "Saturday works",
  made_at: made,
  undo: "Goes in 15 seconds. Undo stops it.",
  payload: { conversation_id: CONV, who: "Priya", text: "Saturday works", window_open: true },
  ...over,
});

test("a press walks its spec's call as a request of the member's own, marked as a card's, and keeps what became of it", async () => {
  const { tables, ctx } = world([noteCard()]);
  answers.push({ status: 200, json: { ok: true, data: { id: "note-1", decision_id: "d1" } } });
  const a = await runAct(ctx, req(), member, { messageId: MSG, proposalId: "p-note", by: "press" });
  assert.equal(a.ok, true);
  assert.equal(a.outcome.state, "done");
  assert.equal(a.outcome.receipt, "Noted on Priya.");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^http:\/\/app\.test\/api\/v1\/.*workspace=harbor/);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.cookie, "sb=session", "under the member's own session");
  assert.equal(calls[0].headers["x-via"], "ask");
  assert.equal(calls[0].headers["idempotency-key"], "p-note");
  assert.equal(tables.ask_messages[0].content.proposals[0].outcome.state, "done", "kept on the turn");
  assert.equal(tables.ask_actions.length, 1, "and in its record");
  assert.equal(tables.ask_actions[0].by, "press");
  assert.equal(tables.ask_actions[0].state, "done");
});

test("pressed twice, it acts once: the second is what the first did", async () => {
  const { ctx } = world([noteCard({ outcome: { state: "done", receipt: "Noted on Priya.", atMs: 1, undo: null } })]);
  const a = await runAct(ctx, req(), member, { messageId: MSG, proposalId: "p-note", by: "press" });
  assert.equal(a.ok, true);
  assert.equal(calls.length, 0);
});

test("D37: a refusal is one sentence and one way forward, and it is kept", async () => {
  const { tables, ctx } = world([noteCard()]);
  answers.push({
    status: 400,
    json: { ok: false, error: { code: "validation", message: "Set up your mailbox first." } },
  });
  const a = await runAct(ctx, req(), member, { messageId: MSG, proposalId: "p-note", by: "press" });
  assert.equal(a.ok, false);
  assert.equal(a.message, "Set up your mailbox first.");
  assert.deepEqual(a.forward, { to: "admin/connections" });
  assert.equal(tables.ask_messages[0].content.proposals[0].outcome.state, "failed");
  assert.equal(tables.ask_actions[0].state, "failed");
});

test("D35: they wrote again since the card was made: nothing goes out, and it says so", async () => {
  const { ctx } = world([replyCard()], {
    conversations: [{ id: CONV, tenant_id: TENANT, state: "open", assignee_user_id: null, snooze_until: null }],
    messages: [
      {
        id: "m1",
        tenant_id: TENANT,
        conversation_id: CONV,
        direction: "inbound",
        status: "received",
        created_at: new Date().toISOString(),
      },
    ],
  });
  const a = await runAct(ctx, req(), member, { messageId: MSG, proposalId: "p-reply", by: "press" });
  assert.equal(a.ok, false);
  assert.match(a.message, /Priya wrote again/);
  assert.equal(a.redraft, true);
  assert.equal(calls.length, 0, "no reply was sent");
});

test("D35: a teammate has the thread: nothing goes out", async () => {
  const { ctx } = world([replyCard()], {
    conversations: [
      {
        id: CONV,
        tenant_id: TENANT,
        state: "open",
        assignee_user_id: "99999999-9999-4999-8999-999999999999",
        snooze_until: null,
      },
    ],
  });
  const a = await runAct(ctx, req(), member, { messageId: MSG, proposalId: "p-reply", by: "press" });
  assert.equal(a.ok, false);
  assert.match(a.message, /teammate has this/);
  assert.equal(calls.length, 0);
});

test("a plan's send fills its tokens from what its steps made, under the step's own key, and waits for a step not made", async () => {
  const plan = (step, after = [], silent = false) => ({ id: "plan-1", step, of: 2, silent, after });
  const msg = {
    id: "p-m",
    kind: "message",
    needs: "operator",
    title: "m",
    summary: "",
    made_at: made,
    undo: null,
    payload: {
      name: "offer",
      versions: { email: { subject: "s", body: "b" } },
      language: "en_US",
      category: "marketing",
      slots: [],
    },
    plan: plan(1, [], true),
  };
  const send = {
    id: "p-s",
    kind: "playbook",
    needs: "operator",
    title: "s",
    summary: "",
    made_at: made,
    undo: null,
    payload: {
      trigger: "saved_list",
      template_id: "@step:1",
      params: [],
      list_key: "offers_ok",
      policy_class: "campaign",
      cap_per_run: 3,
      run_hour: 10,
      gap_days: 0,
      cadence_days: 1,
      name: "Offer",
      words_shown: true,
      mode: "auto",
    },
    plan: plan(2, [1]),
  };
  const waiting = world([msg, send]);
  const refused = await runAct(waiting.ctx, req(), member, { messageId: MSG, proposalId: "p-s", by: "press" });
  assert.equal(refused.ok, false, "its step is not made yet");
  assert.equal(calls.length, 0);

  const done = world([
    { ...msg, outcome: { state: "done", receipt: "", atMs: 1, made: { kind: "message", id: "v-9" } } },
    send,
  ]);
  answers.push({
    status: 200,
    json: {
      ok: true,
      data: {
        id: "pb-1",
        name: "Offer",
        words_ok: true,
        first_at: "2026-11-10T15:00:00.000Z",
        at: "2026-11-09T20:00:00.000Z",
        timezone: "America/New_York",
      },
    },
  });
  const a = await runAct(done.ctx, req(), member, { messageId: MSG, proposalId: "p-s", by: "press" });
  assert.equal(a.ok, true);
  assert.equal(calls[0].body.template_id, "v-9", "its token filled");
  assert.equal(calls[0].body.words_shown, true, "the press is the OK of the words it showed");
  assert.equal(calls[0].headers["idempotency-key"], "plan:plan-1:2");
  assert.match(a.outcome.receipt, /^Offer on\. First 3 go tomorrow at 10:00 AM\.$/);
});

test("a send whose first batch still waits says so: the receipt never claims what the door did not do", async () => {
  const send = {
    id: "p-s",
    kind: "playbook",
    needs: "operator",
    title: "s",
    summary: "",
    made_at: made,
    undo: null,
    payload: {
      trigger: "saved_list",
      template_id: "x",
      params: [],
      list_key: "offers_ok",
      policy_class: "campaign",
      cap_per_run: 3,
      run_hour: 10,
      gap_days: 0,
      cadence_days: 1,
      name: "Offer",
      mode: "auto",
    },
  };
  const { ctx } = world([send]);
  answers.push({ status: 200, json: { ok: true, data: { id: "pb-1", name: "Offer", words_ok: false } } });
  const a = await runAct(ctx, req(), member, { messageId: MSG, proposalId: "p-s", by: "press" });
  assert.match(a.outcome.receipt, /Its first batch waits for your OK\./);
});

test("an undo goes through the spec's own way back, naming the decision it reverses, and the turn says so", async () => {
  const card = noteCard({
    outcome: {
      state: "done",
      receipt: "Noted.",
      atMs: Date.now(),
      undo: {
        note_id: "n1",
        contact_id: "11111111-1111-4111-8111-111111111111",
        decision_id: "dddddddd-0000-4000-8000-000000000000",
      },
    },
  });
  const { tables, ctx } = world([card]);
  const a = await undoAct(ctx, req(), member, { messageId: MSG, proposalId: "p-note" });
  assert.equal(a.ok, true);
  assert.equal(calls[0].headers["x-undo-of"], "dddddddd-0000-4000-8000-000000000000");
  assert.equal(tables.ask_messages[0].content.proposals[0].outcome.state, "undone");
});
