/**
 * What a card says is what it does (decision 0132, the live run of 14 Nov 2026): a batch decided on Campaigns is never
 * named as waiting nor pressed again, a yes presses only a card made in the last half hour and is checked against the card's
 * own terms, and a search's press asks for the count its button said. Each route a press would reach is stood in by
 * `fetch`, and the yes check's model by model-json's setModelStream.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROPOSAL_SPECS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { PLAN } from "../../_lead-fixtures.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runAct } = await import(at("apps/dashboard/src/server/ask/act/run.ts"));
const { findRunsDecided } = await import(at("apps/dashboard/src/server/ask/act/recheck.ts"));
const { press_card } = await import(at("apps/dashboard/src/server/ask/tools/act/press.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/shared/model-json.ts"));

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RUN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const member = { tenantId: TENANT, role: "owner", facts: {} };
const req = () =>
  new Request(`http://app.test/api/v1/ask/act?workspace=harbor`, { method: "POST", headers: { cookie: "sb=session" } });
const ago = (ms) => new Date(Date.now() - ms).toISOString();

/** "Approve the batch: Agency owner outreach", as Ask made it at 6:54. */
const batchCard = (over = {}) => ({
  id: "p-batch",
  kind: "run",
  needs: "operator",
  title: "Approve the batch: Agency owner outreach",
  summary: "41 emails · each goes at its own time",
  made_at: ago(60_000),
  undo: null,
  origin: { by: "asked", strangers: false },
  payload: { broadcast_id: RUN, verb: "approve", name: "Agency owner outreach" },
  ...over,
});

const world = (card, runState) => {
  const tables = {
    ask_messages: [{ id: MSG, thread_id: "t", tenant_id: TENANT, role: "assistant", content: { proposals: [card] } }],
    ask_actions: [],
    sequence_batches: runState ? [{ id: RUN, tenant_id: TENANT, state: runState, name: "Agency owner outreach" }] : [],
  };
  return { tables, ctx: { supabase: fakeDb(tables), userId: USER, params: {} } };
};

let calls;
let asked;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  asked = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ ok: true, data: { id: RUN, recipient_count: 41 } }), { status: 200 });
  };
  setModelStream(async function* (request) {
    asked.push(request);
    yield { type: "text", index: 0, text: JSON.stringify({ yes: true }) };
    yield { type: "stop", stopReason: "end_turn" };
  });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  setModelStream(null);
});

test("REGRESSION (the live run of 14 Nov 2026): a batch approved on Campaigns since its card was made is pressed no more, and says so", async () => {
  const { tables, ctx } = world(batchCard(), "scheduled");
  const a = await runAct(ctx, req(), member, { messageId: MSG, proposalId: "p-batch", by: "press" });
  assert.equal(a.ok, false);
  assert.equal(calls.length, 0, "nothing reached the approve door");
  assert.equal(a.message, "This send was already decided on Campaigns (scheduled), so there is nothing to do here.");
  assert.equal(tables.ask_messages[0].content.proposals[0].outcome.moved, true, "the card stands as moved on");
});

test("a batch still waiting goes as before; one decided is named, one waiting is not, and a batch gone reads as canceled", async () => {
  const { ctx } = world(batchCard(), "pending_approval");
  assert.deepEqual(await findRunsDecided(ctx, TENANT, [batchCard()]), []);
  const gone = world(batchCard(), null).ctx;
  assert.deepEqual(await findRunsDecided(gone, TENANT, [batchCard()]), [{ id: "p-batch", state: "canceled" }]);
  const other = { ...batchCard(), id: "p-note", kind: "note", payload: {} };
  assert.deepEqual(await findRunsDecided(gone, TENANT, [other]), [], "only a batch card is read");
});

/** A yes said in the thread to the card waiting there. */
const sayYes = (card, tables, question = "Yes, run the New York City search") =>
  press_card.actions.yes.build(
    {
      ctx: { supabase: fakeDb(tables), userId: USER, params: {} },
      tenantId: TENANT,
      role: "owner",
      timezone: "UTC",
      language: "en",
      now: new Date(),
      question,
      request: req(),
      member,
      waitingOn: new Map([[card.id, { card, messageId: MSG, cards: [card] }]]),
    },
    { card_id: card.id },
  );

test("REGRESSION (the live run of 14 Nov 2026): a yes never presses a card made over half an hour ago, out of view; Ask makes it again", async () => {
  const old = batchCard({ made_at: ago(100 * 60_000) });
  const { tables } = world(old, "pending_approval");
  const out = await sayYes(old, tables, "yes, send it");
  assert.equal(out.isError, true);
  assert.match(out.result, /made a while ago and is out of view: make it again with the same terms/);
  assert.equal(calls.length, 0, "nothing was pressed");
  assert.equal(asked.length, 0, "not even asked whether it was a yes");
});

test("the yes check reads the card's own terms beside its title, so a yes to one place is checked against the place the card names", async () => {
  const fresh = batchCard();
  const { tables } = world(fresh, "pending_approval");
  await sayYes(fresh, tables, "yes, send it");
  const said = JSON.stringify(asked[0]?.request?.messages ?? asked[0]?.messages ?? asked[0]);
  assert.match(said, /Approve the batch: Agency owner outreach: 41 emails · each goes at its own time/);
  // Asked on its own line of the ledger (00658), with the words its test set judges (tooling/scripts/evals/yes-check.mjs).
  assert.equal(asked[0]?.purpose, "yes_check");
  assert.match(String(asked[0]?.request?.system), /^You decide one thing: did this person just tell us to go ahead/);
  assert.match(said, /They said: yes, send it/);
});

test("REGRESSION (the live run of 14 Nov 2026): a search card's press asks for the count its button said, bound to the month's room", () => {
  // The card said "Find 64 leads": 64 left of the month while the plan asked for 300.
  const facts = {
    dupes: 0,
    leadsLeft: 64,
    bound: "allowance",
    prior: null,
    priorOf: null,
    renewsOn: "Dec 1",
    nearby: [],
  };
  const card = { id: "p-1", kind: "lead_search", summary: "", payload: { plan: { ...PLAN, count: 300 }, facts } };
  const call = PROPOSAL_SPECS.lead_search.commit(card, { kind: "page" });
  assert.equal(call.route, "POST lead-searches");
  assert.equal(call.body.count, 64);
  // With room for all of it, the plan's own count.
  const roomy = { ...card, payload: { ...card.payload, facts: { ...facts, leadsLeft: 500, bound: null } } };
  assert.equal(PROPOSAL_SPECS.lead_search.commit(roomy, { kind: "page" }).body.count, 300);
  // The receipt says what it started with and, cut short at the press, when the rest can follow.
  const receipt = PROPOSAL_SPECS.lead_search.receipt(card, { count: 64, asked: 300, renews_on: "Dec 1" });
  assert.match(receipt, /^Finding 64 /);
  assert.match(
    receipt,
    /That is all your leads left this month · the other 236 can follow once they renew on Dec 1\.$/,
  );
});
