/**
 * A card of several calls that stops part way (server/ask/act/run.ts sendAll, D37 of the answers canvas): what went stands,
 * so the card, its record and Ask never say "nothing went out" when part of it did. Only a card whose first call stopped
 * says it. A note for 120 people is three calls of fifty (contracts people-verbs manyCalls); each call's route is stood in
 * by `fetch`, and the yes check's model by model-json's setModelStream.
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
const { runAct } = await import(at("apps/dashboard/src/server/ask/act/run.ts"));
const { press_card } = await import(at("apps/dashboard/src/server/ask/tools/act/press.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/shared/model-json.ts"));

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const member = { tenantId: TENANT, role: "owner", facts: {} };

const req = () =>
  new Request(`http://app.test/api/v1/ask/act?workspace=harbor`, { method: "POST", headers: { cookie: "sb=session" } });

/** A note for 120 people: three calls of fifty. */
const ids = Array.from({ length: 120 }, (_, i) => `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`);
const manyCard = {
  id: "p-many",
  kind: "note_many",
  needs: "operator",
  title: "Note for 120 people",
  summary: "Prefers mornings",
  made_at: new Date(Date.now() - 60_000).toISOString(),
  undo: null,
  origin: { by: "asked", strangers: false },
  payload: { ids, append: "Prefers mornings" },
};

const world = () => {
  const tables = {
    ask_messages: [
      { id: MSG, thread_id: "t", tenant_id: TENANT, role: "assistant", content: { proposals: [manyCard] } },
    ],
    ask_actions: [],
  };
  return { tables, ctx: { supabase: fakeDb(tables), userId: USER, params: {} } };
};

/** Each call's answer in turn: a number is a status with no words of the route's own. */
let answers;
let calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  answers = [];
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const status = answers.shift() ?? 200;
    const json = status === 200 ? { ok: true, data: { noted: 50 } } : { ok: false, error: { code: "internal" } };
    return new Response(JSON.stringify(json), { status });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  setModelStream(null);
});

test("two of three calls went, then one stopped: the card says what went and what did not, never that nothing went out", async () => {
  const { tables, ctx } = world();
  answers.push(200, 200, 500);
  const a = await runAct(ctx, req(), member, { messageId: MSG, proposalId: "p-many", by: "press" });
  assert.equal(calls.length, 3);
  assert.equal(a.ok, false);
  assert.equal(a.landed, 2, "the answer says how many went");
  assert.match(a.message, /^2 of 3 parts went/);
  assert.match(a.message, /The rest did not go/);
  assert.doesNotMatch(a.message, /[Nn]othing went out/);
  const kept = tables.ask_messages[0].content.proposals[0].outcome;
  assert.equal(kept.state, "failed", "the card offers Try again, which picks up where it stopped");
  assert.equal(kept.receipt, a.message);
  assert.equal(tables.ask_actions[0].state, "failed");
  assert.equal(tables.ask_actions[0].code, "partly_done", "the record says part of it was done");
});

test("the first call stopped: nothing went, and it still says nothing went out", async () => {
  const { tables, ctx } = world();
  answers.push(500);
  const a = await runAct(ctx, req(), member, { messageId: MSG, proposalId: "p-many", by: "press" });
  assert.equal(calls.length, 1);
  assert.equal(a.ok, false);
  assert.equal(a.landed ?? 0, 0);
  assert.match(a.message, /Nothing went out/);
  assert.notEqual(tables.ask_actions[0].code, "partly_done");
});

/** A yes said in the thread to the card waiting there. */
const sayYes = (tables) =>
  press_card.actions.yes.build(
    {
      ctx: { supabase: fakeDb(tables), userId: USER, params: {} },
      tenantId: TENANT,
      role: "owner",
      timezone: "UTC",
      language: "en",
      now: new Date(),
      question: "yes, do it",
      request: req(),
      member,
      waitingOn: new Map([["p-many", { card: manyCard, messageId: MSG, cards: [manyCard] }]]),
    },
    { card_id: "p-many" },
  );

test("Ask's own words, on a yes: part of it went, so it says what went and what did not", async () => {
  const { tables } = world();
  setModelStream(async function* () {
    yield { type: "text", index: 0, text: JSON.stringify({ yes: true }) };
    yield { type: "stop", stopReason: "end_turn" };
  });
  answers.push(200, 200, 500);
  const out = JSON.parse((await sayYes(tables)).result);
  assert.equal(out.pressed, false);
  assert.match(out.why, /^2 of 3 parts went/);
  assert.doesNotMatch(out.note, /nothing went out/i, "never told to say nothing went out");
  assert.match(out.note, /what went/);
});

test("Ask's own words, on a yes: the first call stopped, so nothing went out", async () => {
  const { tables } = world();
  setModelStream(async function* () {
    yield { type: "text", index: 0, text: JSON.stringify({ yes: true }) };
    yield { type: "stop", stopReason: "end_turn" };
  });
  answers.push(500);
  const out = JSON.parse((await sayYes(tables)).result);
  assert.equal(out.pressed, false);
  assert.match(out.note, /nothing went out/);
});
