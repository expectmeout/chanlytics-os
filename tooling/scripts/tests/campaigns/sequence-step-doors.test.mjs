/**
 * A customer's call or note on a sequence's record (decision 0065 step 6), at the doors that write it
 * (server/sequences/doors.ts) and at Ask's cards over the same steps (server/ask/tools/act/sequence.ts), executed over the
 * database in memory: each door's reads and its write are the database's own functions (00442 sequence_overview,
 * sequence_steps_of, sequence_step_save, sequence_step_words), answered here as they answer, their parameters held to the
 * schema's.
 *
 * - A call or a note closes a sequence: a step added after one is refused in the page's words before anything is written,
 *   whichever the last step is by its place.
 * - A call or a note added is its wait, its words and what must still hold: no message, no values, no channels.
 * - A message step keeps a message and a call its words: a call's words on a message step, values on a call, or a call
 *   given a message's words are each refused in their own words; a call's words changed are its id and its words alone.
 * - Ask's cards meet the same rules in the model's words: no step after a call, no params on one, no words for one, and a
 *   call taken away is named by its kind (contracts handTitleOf), never as a message it does not send.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NEW_WORDS, REACH_OUT_GAP_FIRST, SEQUENCE_FLOW_WORDS as F, handTitleOf } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { addSequenceStep, changeSequenceStep, changeSequenceWords } = await import(
  at("apps/dashboard/src/server/sequences/doors.ts")
);
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEQ = "11111111-1111-4111-8111-111111111111";
const STEP2 = "22222222-2222-4222-8222-222222222222";
const STEP3 = "33333333-3333-4333-8333-333333333333";
const MSG = "44444444-4444-4444-8444-444444444444";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-10-20T14:00:00Z");
const WORDS = "ask how the cut held up";

/** A win-back on the quiet ones as 00442 sequence_overview answers its row: on, three steps. */
const ROW = {
  id: SEQ,
  name: "Win-back",
  starts: "moment",
  state: "on",
  mode: "veto",
  created_at: "2026-09-18T12:00:00Z",
  first: {
    id: SEQ,
    kind: "moment",
    trigger: "quiet_30",
    state: "running",
    policy_class: "reengage",
    run_hour: 10,
    list_id: null,
    list_key: null,
    list_name: null,
    search_id: null,
    search_name: null,
    owner_sends: false,
    until: null,
    words_ok_at: null,
    template_name: "come_back",
    template_language: "en_US",
  },
  date: null,
  steps: 3,
  channels: ["whatsapp"],
  needs: { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] },
  next: null,
  last: null,
  in_it: 4,
};
/** A step in its place as 00442 sequence_steps_of answers it: the first step has the sequence's own id. */
const step = (place, id, over = {}) => ({
  id,
  place,
  name: "Win-back",
  kind: "moment",
  trigger: place === 1 ? "quiet_30" : "after_step",
  state: "running",
  after_days: place === 1 ? null : 3,
  only_if: place === 1 ? [] : ["no_booking"],
  channels: ["whatsapp"],
  template_id: `0000000${place}-0000-4000-8000-000000000000`,
  template_name: "come_back",
  template_language: "en_US",
  params: [],
  hand: null,
  next_words: null,
  words_ok_at: null,
  sent: 0,
  replied: 0,
  ...over,
});
/** A call or a note for the team as the reader answers one: no message, its kind and its words. */
const handStep = (place, id, kind) =>
  step(place, id, {
    template_id: null,
    template_name: null,
    template_language: null,
    channels: [],
    hand: { kind, words: WORDS },
  });
/** Steps 1 and 2 send a message; step 3 is `last`, answered out of place order (the door finds the last by its place). */
const stepsWith = (last) => [last, step(1, SEQ), step(2, STEP2)];

/** The database in memory: the readers answer `steps`, and each door answers as it answers one it wrote. */
function world(steps) {
  return fakeDb(
    {},
    {},
    {
      sequence_overview: (a) => (a.p_sequence_id === SEQ ? [ROW] : []),
      sequence_steps_of: (a) => (a.p_sequence_id === SEQ ? steps : []),
      sequence_step_save: (a) => ({ id: a.p_step.id ?? STEP3, place: 3, decision_id: "d1" }),
      sequence_step_words: (a) => ({ id: a.p_step_id, waits: false, decision_id: "d1" }),
    },
  );
}
const ctxOf = (supabase) => ({ supabase, userId: USER, email: "ada@example.com", metadata: {} });
const SEQUENCE = { id: SEQ, tenant_id: A };
/** The door functions the database was asked to run, in order. */
const rpcsOf = (db) => db.seen.filter((q) => q.rpc).map((q) => q.rpc);
const writesOf = (db) => db.seen.filter((q) => q.rpc === "sequence_step_save" || q.rpc === "sequence_step_words");

async function refused(p, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.name, "AppError", e.message);
    assert.deepEqual([e.code, e.status, e.message], ["validation", 422, words]);
    return true;
  });
}

test("a step added after a call or a note is refused in the page's words, and nothing is written", async () => {
  for (const kind of ["call", "note"]) {
    // After either, neither a message nor another call goes.
    for (const input of [
      { after_days: 4, template_id: MSG, params: [] },
      { after_days: 4, hand: { kind: "note", words: "send the aftercare sheet" } },
    ]) {
      const db = world(stepsWith(handStep(3, STEP3, kind)));
      await refused(addSequenceStep(ctxOf(db), SEQUENCE, input), F.nothingAfterHand);
      assert.deepEqual(rpcsOf(db), ["sequence_overview", "sequence_steps_of"], `${kind}: read, never written`);
    }
  }
});

test("a call added after a message is its wait, its words and what must still hold: no message, values or channels", async () => {
  const db = world(stepsWith(step(3, STEP3)));
  const hand = { kind: "call", words: WORDS };
  const answer = await addSequenceStep(ctxOf(db), SEQUENCE, { after_days: 4, hand, only_if: ["no_booking"] });
  assert.deepEqual(answer, { id: STEP3, place: 3, decision_id: "d1" });
  const [save, ...more] = writesOf(db);
  assert.equal(more.length, 0, "one write");
  assert.deepEqual(save.args, {
    p_tenant_id: A,
    p_sequence_id: SEQ,
    p_step: { after_days: 4, hand, only_if: ["no_booking"] },
    p_decision: { fields: ["after_days", "hand", "only_if"] },
  });
  for (const key of ["template_id", "params", "channels"]) assert.ok(!(key in save.args.p_step), `no ${key}`);
});

test("a message step keeps a message and a call its words: each crossing is refused in its own words, before any write", async () => {
  const message = world(stepsWith(step(3, STEP3)));
  await refused(
    changeSequenceStep(ctxOf(message), SEQUENCE, STEP3, { hand: { kind: "call", words: WORDS } }),
    F.handOnMessage,
  );
  const call = world(stepsWith(handStep(3, STEP3, "call")));
  await refused(changeSequenceStep(ctxOf(call), SEQUENCE, STEP3, { params: ["Ana"] }), F.valuesOnHand);
  await refused(changeSequenceStep(ctxOf(call), SEQUENCE, STEP3, { channels: ["email"] }), F.channelsOnHand);
  await refused(changeSequenceWords(ctxOf(call), SEQUENCE, STEP3, { template_id: MSG, params: [] }), F.valuesOnHand);
  assert.deepEqual([writesOf(message), writesOf(call)], [[], []], "nothing written");
});

test("a call's words changed are its id and its words alone, through the step's own door", async () => {
  const db = world(stepsWith(handStep(3, STEP3, "call")));
  const hand = { kind: "note", words: "send the aftercare sheet" };
  const answer = await changeSequenceStep(ctxOf(db), SEQUENCE, STEP3, { hand });
  assert.equal(answer.id, STEP3);
  const [save, ...more] = writesOf(db);
  assert.equal(more.length, 0);
  assert.deepEqual(save.args, {
    p_tenant_id: A,
    p_sequence_id: SEQ,
    p_step: { id: STEP3, hand },
    p_decision: { fields: ["hand"] },
  });
});

/* ---- Ask's cards over the same steps ---- */

/** One call the model makes to propose_sequence, over the workspace in memory: the card, or the refusal it hears. */
async function ask(steps, input) {
  const supabase = fakeDb(
    {
      memberships: [
        { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
      ],
      tenants: [{ id: A, name: "Harbor", timezone: TZ, config: {} }],
      policies: [],
    },
    {},
    {
      sequence_overview: (a) => (a.p_sequence_id === SEQ ? [ROW] : []),
      sequence_steps_of: (a) => (a.p_sequence_id === SEQ ? steps : []),
    },
  );
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
  const out = await buildProposal(t, "propose_sequence", input);
  const p = out.proposal;
  return p ? { kind: p.kind, title: p.title, summary: p.summary, payload: p.payload } : JSON.parse(out.result);
}
/** Ask's record, in place order, as the page reads it: steps 1 and 2 a message, step 3 a call. */
const CALL_LAST = [step(1, SEQ), step(2, STEP2), handStep(3, STEP3, "call")];

test("Ask proposes no step after a call, no params on one and no words for one, and says why", async () => {
  const after = await ask(CALL_LAST, { action: "step", sequence_id: SEQ, after_days: 4, template_id: MSG });
  assert.match(after.error, /last step is a call or a note, and nothing goes after one/);
  const params = await ask(CALL_LAST, { action: "step", sequence_id: SEQ, step_id: STEP3, params: ["Ana"] });
  assert.match(params.error, /a call or a note has no message, so no params/);
  const channels = await ask(CALL_LAST, { action: "step", sequence_id: SEQ, step_id: STEP3, channels: ["email"] });
  assert.match(channels.error, /lands on Today and goes by no channel/);
  const words = await ask(CALL_LAST, { action: "words", sequence_id: SEQ, step_id: STEP3, template_id: MSG });
  assert.match(words.error, /that step is a call or a note: it sends no message/);
  // Its wait still changes, as the page's editor changes it.
  const wait = await ask(CALL_LAST, { action: "step", sequence_id: SEQ, step_id: STEP3, after_days: 5 });
  assert.deepEqual([wait.kind, wait.payload.step_id, wait.payload.after_days], ["sequence_step", STEP3, 5]);
});

test("a call taken away is named by its kind on Ask's card, never as a message it does not send", async () => {
  const card = await ask(CALL_LAST, { action: "step_remove", sequence_id: SEQ, step_id: STEP3 });
  assert.equal(card.kind, "sequence_step_remove");
  assert.deepEqual(card.payload, { sequence_id: SEQ, step_id: STEP3 });
  assert.ok(card.summary.startsWith(`Step 3 (${handTitleOf("call")}) go;`), card.summary);
  assert.equal(handTitleOf("call"), NEW_WORDS.hand.callTitle);
  assert.doesNotMatch(card.summary, /its message|come_back/);
  // A note, by its own title; a message step before it, by its message, with the call after it going too.
  const note = await ask([step(1, SEQ), step(2, STEP2), handStep(3, STEP3, "note")], {
    action: "step_remove",
    sequence_id: SEQ,
    step_id: STEP3,
  });
  assert.ok(note.summary.startsWith(`Step 3 (${NEW_WORDS.hand.noteTitle}) go;`), note.summary);
  const message = await ask(CALL_LAST, { action: "step_remove", sequence_id: SEQ, step_id: STEP2 });
  assert.ok(message.summary.startsWith("Step 2 (come_back) and the 1 step after it go;"), message.summary);
});

test("Ask's cold email starts at the pace every new sequence starts at, one email every 20 minutes, unless it names one (0077, D7)", async () => {
  const SEARCH = "5eed0000-0000-4000-8000-000000000001";
  const card = async (more = {}) => {
    const supabase = fakeDb(
      {
        memberships: [
          { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
        ],
        tenants: [{ id: A, name: "Harbor", timezone: TZ, config: {} }],
        policies: [],
        lead_searches_view: [{ id: SEARCH, tenant_id: A, name: "Plumbers in Queens" }],
        mailbox_connections: [],
      },
      {},
      {},
    );
    const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
    const out = await buildProposal(t, "propose_sequence", {
      action: "cold_email",
      name: "Plumbers in Queens",
      search_id: SEARCH,
      steps: [
        { subject: "Quick one for {{business}}", body: "{{opening}}\n\nI run Harbor. Would it be worth a look?" },
      ],
      ...more,
    });
    assert.ok(out.proposal, out.result);
    return out.proposal;
  };
  const plain = await card();
  assert.equal(plain.payload.chain.gap_minutes, REACH_OUT_GAP_FIRST, "REGRESSION: Ask proposed 12 while New makes 20");
  assert.match(plain.summary, /one every 20 minutes/);
  // One the model names is kept.
  assert.equal((await card({ gap_minutes: 30 })).payload.chain.gap_minutes, 30);
});

test("Ask's cold email is signed as New signs it, by the member's first name, unless it names who signs (30 Oct 2026)", async () => {
  const SEARCH = "5eed0000-0000-4000-8000-000000000001";
  const card = async (profiles, more = {}) => {
    const supabase = fakeDb(
      {
        memberships: [
          { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
        ],
        tenants: [{ id: A, name: "Harbor", timezone: TZ, config: {} }],
        policies: [],
        lead_searches_view: [{ id: SEARCH, tenant_id: A, name: "Plumbers in Queens" }],
        mailbox_connections: [],
        profiles,
      },
      {},
      {},
    );
    const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ, NOW);
    const out = await buildProposal(t, "propose_sequence", {
      action: "cold_email",
      name: "Plumbers in Queens",
      search_id: SEARCH,
      steps: [
        { subject: "Quick one for {{business}}", body: "{{opening}}\n\nI run Harbor. Would it be worth a look?" },
        { body: "Just following up.\n\n- {{your name}}", after_days: 4 },
      ],
      ...more,
    });
    assert.ok(out.proposal, out.result);
    return out.proposal.payload.chain;
  };
  // REGRESSION: Ask made a sequence with no one to sign it; its first emails ended unsigned and its second, which names
  // {{your name}}, was held by the sender (no_signed_by) while its preview signed it with the member's name.
  assert.equal((await card([{ user_id: USER, display_name: "Ada Lovelace" }])).signed_by, "Ada");
  assert.equal(
    (await card([{ user_id: USER, display_name: "Ada Lovelace" }], { signed_by: "Grace" })).signed_by,
    "Grace",
  );
  // A member with no name of their own is never signed as their address: the step's sender then says so.
  assert.equal((await card([])).signed_by, null);
});
