/**
 * A call that asks for nothing holds nobody (decision 0136), and is kept on the ledger as a call screened (0137).
 *
 * A call that needed a person, or that reached no answer, opened the thread's `callback` hold whoever rang: a dialler
 * that hangs up when a machine answers sat in Needs you for weeks, "1 waiting over a week" under a toll-free number
 * nobody could ring back (17 Nov 2026). Three things say a call asks for none: the workspace's own word about the
 * caller's thread, the carrier's flag, and silence from a toll-free number the business does not talk with. A toll-free
 * caller who speaks, a local number that hangs up, and anyone the business talks with are held as before; so is a call
 * whose caller could not be read.
 *
 * Since 0137 a fourth thing says it: silence from a number that failed its carrier's check (contracts
 * voice/number-check.ts), from someone the business does not talk with. And every such call leaves a `call.screened`
 * row, which Reports counts.
 *
 * The rule (contracts voice/call-back-owed.ts), the plan (planCallEvent) and the real door over the webhook's world.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  strangerCaller,
  callBackNotOwed,
  callerStandingOf,
  numberCheckFrom,
  numberCheckOf,
  saysUnansweredCall,
  SCREENED_REASONS,
  unansweredCallTodo,
} from "@chanlytics/contracts";
import { normalizeCall } from "@chanlytics/channels/voice";
import { at, kind, openDoor, wire, NOW } from "../calls/_retell-webhook-world.mjs";

// The door reads its keys at import; openDoor() imports it AFTER these lines, on purpose.
process.env.RETELL_WEBHOOK_KEY = "badged-key-for-this-file";
process.env.RETELL_API_KEY = "api-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { deliver, world } = await openDoor();
const { planCallEvent } = await import(at("apps/edge/lib/voice/call-event.ts"));

const TOLL_FREE = "+18665550142";
const LOCAL = "+16465550123";
const STRANGER = { said: null, talks: false };
const NOBODY = {
  setAsideAt: null,
  setAsideWhy: null,
  lastWord: null,
  wrote: false,
  phoned: false,
  acquiredVia: "call",
  nameSource: null,
};

/* ------------------------------------------------------------------ the rule */

test("a caller's standing: the workspace's word about their thread, and whether the business talks with them", () => {
  assert.deepEqual(callerStandingOf(NOBODY), STRANGER, "someone who only ever rang is a stranger");
  assert.equal(
    callerStandingOf({ ...NOBODY, setAsideWhy: "pitch", setAsideAt: null }).said,
    "not_a_customer",
    "a member's word: set aside, and taken off the list",
  );
  assert.equal(
    callerStandingOf({ ...NOBODY, setAsideWhy: "pitch", setAsideAt: "2026-11-17T08:00:00Z" }).said,
    null,
    "a reading set it aside and no member has said so: a reading is no word",
  );
  assert.equal(callerStandingOf({ ...NOBODY, lastWord: "reply_anyway" }).said, "person", "they answered them anyway");
  assert.equal(
    callerStandingOf({ ...NOBODY, lastWord: "reply_anyway", setAsideWhy: "pitch" }).said,
    "not_a_customer",
    "said not a customer since: the thread's own word is the newer one",
  );
  for (const talks of [
    { wrote: true },
    { phoned: true },
    { acquiredVia: "calendar" },
    { acquiredVia: "manual" },
    { nameSource: "typed" },
  ])
    assert.equal(callerStandingOf({ ...NOBODY, ...talks }).talks, true, JSON.stringify(talks));
  for (const not of [{ acquiredVia: "sms" }, { nameSource: "wire" }, { nameSource: "signature" }])
    assert.equal(
      callerStandingOf({ ...NOBODY, ...not }).talks,
      false,
      `${JSON.stringify(not)} is no word of the owner's`,
    );
});

test("when a call asks for no call back: the workspace's word, the carrier's, or silence from a toll-free stranger", () => {
  const silent = (from, disconnectionReason = "user_hangup") => ({ from, silent: true, disconnectionReason });
  const spoke = (from) => ({ from, silent: false, disconnectionReason: "user_hangup" });
  assert.equal(callBackNotOwed(silent(TOLL_FREE), STRANGER), "toll_free_silent");
  assert.equal(callBackNotOwed(silent(LOCAL), STRANGER), null, "a local number that hung up may be a customer");
  assert.equal(
    callBackNotOwed(spoke(TOLL_FREE), STRANGER),
    null,
    "a toll-free caller who speaks is read as any caller is",
  );
  assert.equal(callBackNotOwed(silent(TOLL_FREE), { said: null, talks: true }), null, "the business talks with them");
  assert.equal(callBackNotOwed(silent(TOLL_FREE), { said: "person", talks: false }), null, "a member said: a person");
  assert.equal(
    callBackNotOwed(silent(TOLL_FREE), null),
    null,
    "REGRESSION GUARD: a caller who could not be read is owed the call back, as before",
  );
  assert.equal(callBackNotOwed(silent(LOCAL, "marked_as_spam"), null), "carrier_spam", "the carrier flagged it");
  assert.equal(callBackNotOwed(spoke(LOCAL), { said: "not_a_customer", talks: true }), "not_a_customer");
  assert.equal(callBackNotOwed(silent(LOCAL), { said: "not_a_customer", talks: false }), "not_a_customer");
  // The carrier's word on the number shown (0137): a failed check, with nothing said, from a stranger.
  const failed = (from) => ({ ...silent(from), numberCheck: "failed" });
  assert.equal(
    callBackNotOwed(failed(LOCAL), STRANGER),
    "unverified_silent",
    "a local number its carrier did not vouch for",
  );
  assert.equal(
    callBackNotOwed(failed(TOLL_FREE), STRANGER),
    "unverified_silent",
    "said before toll-free: the carrier's word",
  );
  assert.equal(
    callBackNotOwed({ ...spoke(LOCAL), numberCheck: "failed" }, STRANGER),
    null,
    "a caller who speaks is read",
  );
  assert.equal(callBackNotOwed(failed(LOCAL), { said: null, talks: true }), null, "the business talks with them");
  assert.equal(callBackNotOwed(failed(LOCAL), null), null, "nor a caller who could not be read");
  for (const check of ["passed", "unsigned", null])
    assert.equal(
      callBackNotOwed({ ...silent(LOCAL), numberCheck: check }, STRANGER),
      null,
      `${check}: no word against them`,
    );
  // Past a week, the same standing lets a silent call's hold go.
  assert.equal(strangerCaller(STRANGER), true);
  assert.equal(strangerCaller({ said: null, talks: true }), false);
  assert.equal(strangerCaller({ said: "person", talks: false }), false);
});

test("the carrier's check on a number is read off two headers, in the carriers' three words, and anything else is nothing known", () => {
  for (const [headers, check] of [
    [{ "x-twilio-verstat": "TN-Validation-Passed-A" }, "passed"],
    [{ "x-twilio-verstat": "TN-Validation-Passed" }, "passed"],
    [{ "x-twilio-verstat": " tn-validation-failed-b " }, "failed"],
    [{ "x-twilio-verstat": "No-TN-Validation" }, "unsigned"],
    [{ "p-asserted-identity": "<sip:+16465550123;verstat=TN-Validation-Failed@carrier.example;user=phone>" }, "failed"],
    [{ "p-asserted-identity": "<sip:+16465550123@carrier.example>" }, null],
    // The header of its own outranks the parameter; a word nobody knows is no answer, and never a pass or a fail.
    [
      { "x-twilio-verstat": "TN-Validation-Passed-A", "p-asserted-identity": "<sip:1;verstat=TN-Validation-Failed@x>" },
      "passed",
    ],
    [{ "x-twilio-verstat": "TN-Validation-Failed-Z" }, null],
    [{ "x-twilio-verstat": "failed" }, null],
    [{ "x-twilio-verstat": 7 }, null],
    [{ diversion: "<sip:+13055550100@carrier.example>" }, null],
    [{}, null],
    [null, null],
    [undefined, null],
  ])
    assert.equal(numberCheckOf(headers), check, JSON.stringify(headers));
  // As a call's metadata carries it back: one of the three words, or nothing.
  assert.deepEqual(["passed", "failed", "unsigned"].map(numberCheckFrom), ["passed", "failed", "unsigned"]);
  for (const other of ["TN-Validation-Failed", "", 1, null, undefined, { failed: true }])
    assert.equal(numberCheckFrom(other), null, JSON.stringify(other));
});

test("a hold's details say whether silence asked for it, in the words the to-do wrote", () => {
  const base = {
    direction: "inbound",
    status: "ended",
    duration_ms: 4_000,
    disconnection_reason: "user_hangup",
    in_voicemail: false,
    outcome: null,
  };
  assert.equal(saysUnansweredCall(unansweredCallTodo({ ...base, status: "not_connected", duration_ms: 0 })), true);
  assert.equal(saysUnansweredCall(unansweredCallTodo(base)), true);
  const heardOut = {
    ...base,
    duration_ms: 65_000,
    transcript_object: [{ role: "agent", content: "Hello? Are you there?" }],
  };
  assert.equal(unansweredCallTodo(heardOut), "Hung up after 1 min 5 sec without a word. Call them back.");
  assert.equal(saysUnansweredCall(unansweredCallTodo(heardOut)), true, "whatever its length");
  assert.equal(saysUnansweredCall("Call Priya back about Saturday's colour."), false, "something they said");
  assert.equal(saysUnansweredCall("Hung up on me, wants an apology."), false);
  assert.equal(saysUnansweredCall(""), false);
  assert.equal(saysUnansweredCall(null), false);
});

/* ------------------------------------------------------------------ the plan */

const call = (over = {}) => ({
  call_id: "call_asks_1",
  agent_id: "agent_asks",
  direction: "inbound",
  from_number: TOLL_FREE,
  to_number: "+13055550100",
  start_timestamp: NOW - 40_000,
  end_timestamp: NOW - 34_000,
  ...over,
});
const ingest = {
  call_id: "row-1",
  is_new: false,
  skipped: false,
  recording_state: null,
  contact_id: "k1",
  conversation_id: "c1",
};
const plan = (event, c, caller, numberCheck) =>
  planCallEvent(
    { event, call: c, n: normalizeCall(c), bodyKeys: [], callKeys: [] },
    { ingest, alreadyCorrected: false, canCorrect: true, allowed: null, caller, numberCheck },
  );
/** The step that keeps a call that asks nobody (0137), as the plan lists it. */
const screened = (p) => p.steps.find((s) => s.kind === "screened");
const kinds = (p) => p.steps.map((s) => s.kind);
const MISSED = { call_status: "not_connected", duration_ms: 0, disconnection_reason: "dial_no_answer" };
const HUNG_UP = { call_status: "ended", duration_ms: 6_000, disconnection_reason: "user_hangup" };
const ASKED = {
  call_status: "ended",
  duration_ms: 95_000,
  disconnection_reason: "user_hangup",
  transcript_object: [{ role: "user", content: "We can get you on page one. Have the owner call me." }],
  call_analysis: { custom_analysis_data: { outcome: "callback_needed", follow_up: "Call them back about a listing." } },
};

test("REGRESSION: a toll-free number that never connected, from nobody the business talks with, holds nobody and tells nobody", () => {
  const p = plan("call_ended", call(MISSED), STRANGER);
  assert.equal(kinds(p).includes("callback"), false, "no call back is asked of anyone");
  assert.deepEqual(
    screened(p),
    { kind: "screened", conversationId: "c1", retellCallId: "call_asks_1", reason: "toll_free_silent" },
    "and the step says why, for the log and the ledger",
  );
  assert.equal(p.untold, true, "its notice would say 'Call them back'");
  assert.ok(kinds(p).includes("note"), "it is still a missed call in their thread");
  assert.ok(kinds(p).includes("claim_notification"), "claimed, so no sweep settles it again");
  assert.deepEqual(p.about, { type: "call", id: "row-1" }, "about the call, never a thread that needs anyone");
});

test("the same silence from a local number, from someone the business talks with, or unread, is owed its call back", () => {
  for (const [who, c, caller] of [
    ["a local number", call({ ...MISSED, from_number: LOCAL }), STRANGER],
    ["someone the business talks with", call(MISSED), { said: null, talks: true }],
    ["a caller who could not be read", call(MISSED), null],
  ]) {
    const p = plan("call_ended", c, caller);
    assert.ok(kinds(p).includes("callback"), who);
    assert.equal(p.untold, false, who);
    assert.deepEqual(p.about, { type: "conversation", id: "c1" }, who);
  }
});

test("a toll-free caller who hung up without a word holds nobody; their call is still told, as any call is", () => {
  const ended = plan("call_ended", call(HUNG_UP), STRANGER);
  assert.equal(kinds(ended).includes("callback"), false);
  assert.equal(ended.untold, false, "a call that connected is a call: its notice asks nothing");
});

test("a toll-free caller who spoke and needs a call back is held, as any caller is", () => {
  const p = plan("call_analyzed", call(ASKED), STRANGER);
  const step = p.steps.find((s) => s.kind === "callback");
  assert.ok(step, "what they said decides, not their number");
  assert.equal(step.pause, true);
  assert.equal(step.details, "Call them back about a listing.");
});

test("a call the carrier flagged as spam that never connected holds nobody", () => {
  const p = plan("call_ended", call({ ...MISSED, from_number: LOCAL, disconnection_reason: "marked_as_spam" }), null);
  assert.equal(
    kinds(p).includes("callback"),
    false,
    "REGRESSION: the flag kept the notice back and still asked for a call",
  );
});

test("the workspace's word: a caller a member said is not a customer holds nobody and tells nobody, spoken or silent", () => {
  const said = { said: "not_a_customer", talks: true };
  for (const [what, event, c] of [
    ["they asked for a call back", "call_analyzed", call({ ...ASKED, from_number: LOCAL })],
    ["they never connected", "call_ended", call({ ...MISSED, from_number: LOCAL })],
  ]) {
    const p = plan(event, c, said);
    assert.equal(kinds(p).includes("callback"), false, what);
    assert.equal(p.untold, true, what);
    assert.equal(screened(p)?.reason, "not_a_customer", what);
  }
});

test("a number that failed its carrier's check, from a stranger who said nothing, holds nobody; a dial that never connected tells nobody", () => {
  const missed = plan("call_ended", call({ ...MISSED, from_number: LOCAL }), STRANGER, "failed");
  assert.equal(kinds(missed).includes("callback"), false, "no call back is asked of anyone");
  assert.equal(screened(missed)?.reason, "unverified_silent");
  assert.equal(missed.untold, true, "its notice would say 'Call them back'");
  const hungUp = plan("call_ended", call({ ...HUNG_UP, from_number: LOCAL }), STRANGER, "failed");
  assert.equal(screened(hungUp)?.reason, "unverified_silent");
  assert.equal(hungUp.untold, false, "a call that connected is told, as any call is");
  // The check alone decides nothing: a number that passed, or one the business talks with, is owed its call back.
  for (const [caller, check] of [
    [STRANGER, "passed"],
    [STRANGER, "unsigned"],
    [STRANGER, undefined],
    [{ said: null, talks: true }, "failed"],
    [null, "failed"],
  ]) {
    const p = plan("call_ended", call({ ...MISSED, from_number: LOCAL }), caller, check);
    assert.ok(kinds(p).includes("callback"), `${JSON.stringify(caller)} / ${check}: held as before`);
    assert.equal(screened(p), undefined);
  }
});

test("every reason a call back is not owed is one the ledger keeps", () => {
  for (const [c, caller, check] of [
    [call(MISSED), STRANGER, null],
    [call({ ...MISSED, from_number: LOCAL }), STRANGER, "failed"],
    [call({ ...MISSED, from_number: LOCAL, disconnection_reason: "marked_as_spam" }), null, null],
    [call({ ...MISSED, from_number: LOCAL }), { said: "not_a_customer", talks: false }, null],
  ])
    assert.ok(SCREENED_REASONS.includes(screened(plan("call_ended", c, caller, check))?.reason));
});

/* ------------------------------------------------------------------ the door */

const onItsThread = (w) => {
  const row = w.tables.calls.at(-1);
  return { row, holds: w.tables.escalations.filter((e) => e.conversation_id === row.conversation_id) };
};

test("the door: a toll-free stranger's missed call opens no hold and tells no one; once the business has written to them, it does", async () => {
  const w = world();
  w.open();
  const line = wire();
  try {
    await deliver("call_ended", w.call(w.callId("toll-free"), { ...MISSED, from_number: TOLL_FREE }));
    const first = onItsThread(w);
    assert.ok(first.row.conversation_id, "the call is on the caller's thread");
    assert.deepEqual(first.holds, [], "REGRESSION: a dialler's missed call sat in Needs you");
    assert.deepEqual(w.tables.notifications, [], "and nobody is told to call it back");
    assert.ok(first.row.notified_at, "claimed, so the calls sweep leaves it");
    assert.ok(first.row.notice_told_at, "and marked told, so the notice sweep leaves it");
    assert.deepEqual(
      kind(w.tables, "call.screened").map((e) => [e.category, e.subject_type, e.subject_id, e.data]),
      [
        [
          "call",
          "conversation",
          first.row.conversation_id,
          { reason: "toll_free_silent", call_id: first.row.retell_call_id },
        ],
      ],
      "0137: the call is kept on the ledger as one that asked nobody, which Reports counts",
    );
    // The business writes to them: the next silence from the same number is someone it talks with.
    w.tables.messages.push({
      id: "m-out",
      tenant_id: w.T,
      conversation_id: first.row.conversation_id,
      direction: "outbound",
      sender: "human",
      body: "Thanks for calling, how can we help?",
    });
    await deliver("call_ended", w.call(w.callId("toll-free-again"), { ...MISSED, from_number: TOLL_FREE }));
    assert.deepEqual(
      onItsThread(w).holds.map((h) => [h.reason, h.state]),
      [["callback", "open"]],
      "someone the business talks with is owed the call back",
    );
    assert.equal(kind(w.tables, "call.screened").length, 1, "and a call that is held is not one screened");
  } finally {
    line.restore();
  }
});

test("the door: a member's word on the thread keeps the next call off the list; a local stranger's is held as before", async () => {
  const w = world();
  w.open();
  const line = wire();
  try {
    await deliver("call_ended", w.call(w.callId("local"), MISSED));
    const held = onItsThread(w);
    assert.deepEqual(
      held.holds.map((h) => [h.reason, h.state]),
      [["callback", "open"]],
      "a local number that never connected is owed a call back",
    );
    // A member says the thread is not a customer's (00539: set aside, then taken off the list; its hold resolved).
    const thread = w.tables.conversations.find((c) => c.id === held.row.conversation_id);
    Object.assign(thread, { state: "archived", set_aside_why: "pitch", set_aside_at: null });
    held.holds[0].state = "resolved";
    await deliver("call_ended", w.call(w.callId("local-again"), MISSED));
    assert.deepEqual(
      onItsThread(w).holds.map((h) => h.state),
      ["resolved"],
      "the workspace's word stands: no new hold",
    );
  } finally {
    line.restore();
  }
});

test("the door: the carrier's check comes back in the call's metadata, and a stranger's silent call from a number that failed it opens no hold", async () => {
  const w = world();
  w.open();
  const line = wire();
  try {
    // As the inbound door handed it on when the call arrived (inbound-call.ts callAnswer).
    await deliver(
      "call_ended",
      w.call(w.callId("unverified"), { ...MISSED, from_number: LOCAL, metadata: { number_check: "failed" } }),
    );
    const first = onItsThread(w);
    assert.deepEqual(first.holds, [], "nobody is asked to ring a number its own carrier did not vouch for");
    assert.deepEqual(
      kind(w.tables, "call.screened").map((e) => e.data),
      [{ reason: "unverified_silent", call_id: first.row.retell_call_id }],
    );
    // A word the door never wrote decides nothing: the same call is owed its call back.
    await deliver(
      "call_ended",
      w.call(w.callId("unverified-odd"), {
        ...MISSED,
        from_number: "+16465550177",
        metadata: { number_check: "TN-Validation-Failed" },
      }),
    );
    assert.deepEqual(
      onItsThread(w).holds.map((h) => [h.reason, h.state]),
      [["callback", "open"]],
    );
    assert.equal(kind(w.tables, "call.screened").length, 1);
  } finally {
    line.restore();
  }
});
