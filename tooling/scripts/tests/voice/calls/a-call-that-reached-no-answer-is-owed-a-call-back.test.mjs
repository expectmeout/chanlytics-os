/**
 * A customer's call that reached no answer is owed a call back (the closed-loop audit of 17 Oct 2026, C).
 *
 * Only an analysis that said `callback_needed` opened the thread's `callback` hold, the Needs-you row with Call back and
 * Done that a call back to them closes (00422). A call that never connected was a bell row for a day, and one they left
 * without a word was a Today row for a day: nothing said the caller was still owed a call. Now each opens the same hold
 * as the call ends, and pauses nothing, so the receptionist still answers what they write.
 *
 * The real door (apps/edge/api/retell-webhook.ts) over the voice webhook's world.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { unansweredCallTodo } from "@chanlytics/contracts";
import { openDoor, wire, NOW } from "./_retell-webhook-world.mjs";

// The door reads its keys at import; openDoor() imports it AFTER these lines, on purpose.
process.env.RETELL_WEBHOOK_KEY = "badged-key-for-this-file";
process.env.RETELL_API_KEY = "api-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { deliver, world } = await openDoor();

/** A call as the provider reports it when it ends. */
const ended = (w, id, over = {}) =>
  w.call(id, {
    call_status: "ended",
    start_timestamp: NOW - 40_000,
    end_timestamp: NOW - 34_000,
    duration_ms: 6_000,
    disconnection_reason: "user_hangup",
    ...over,
  });

/** The holds on the thread a call landed on, and the thread itself. */
function onItsThread(w) {
  const call = w.tables.calls.at(-1);
  return {
    call,
    holds: w.tables.escalations.filter((e) => e.conversation_id === call.conversation_id),
    thread: w.tables.conversations.find((c) => c.id === call.conversation_id),
  };
}

test("REGRESSION: a call that never connected is owed a call back: the thread's callback hold, and nothing paused", async () => {
  const w = world();
  w.open();
  const line = wire();
  try {
    await deliver("call_ended", ended(w, w.callId("missed"), { call_status: "not_connected", duration_ms: 0 }));
    const { call, holds, thread } = onItsThread(w);
    assert.ok(call.conversation_id, "the call is on the caller's thread");
    assert.deepEqual(
      holds.map((h) => [h.reason, h.state]),
      [["callback", "open"]],
    );
    assert.equal(holds[0].details, "Missed call: it rang and never connected. Call them back.");
    assert.equal(thread.paused_until ?? null, null, "the receptionist still answers what they write");
  } finally {
    line.restore();
  }
});

test("REGRESSION: a caller who hung up without a word is owed a call back; a replay is the same one hold", async () => {
  const w = world();
  w.open();
  const line = wire();
  try {
    const id = w.callId("hung-up");
    await deliver("call_ended", ended(w, id));
    const first = onItsThread(w);
    assert.deepEqual(
      first.holds.map((h) => [h.reason, h.state]),
      [["callback", "open"]],
    );
    assert.equal(first.holds[0].details, "Hung up after 6 sec without a word. Call them back.");
    assert.equal(first.thread.paused_until ?? null, null);
    await deliver("call_ended", ended(w, id));
    assert.equal(onItsThread(w).holds.length, 1, "one hold, refreshed, never a second");
  } finally {
    line.restore();
  }
});

test("a call they spoke on, the receptionist's own dial nobody answered, and the analysis of a call already owed open nothing new", async () => {
  const w = world();
  w.open();
  const line = wire();
  try {
    // They spoke: the call ended the ordinary way, and its analysis decides (callback_needed, as before).
    await deliver(
      "call_ended",
      ended(w, w.callId("spoke"), {
        duration_ms: 95_000,
        transcript_object: [{ role: "user", content: "Can I book a trim on Friday?" }],
      }),
    );
    // The receptionist dialled and nobody answered: nobody's missed call.
    await deliver(
      "call_ended",
      ended(w, w.callId("outbound"), { call_status: "not_connected", duration_ms: 0, direction: "outbound" }),
    );
    assert.deepEqual(w.tables.escalations, [], "no call back is owed on either");
  } finally {
    line.restore();
  }
});

test("the rule's words: a missed call and a silent hang-up each say what to do; anything else says nothing", () => {
  const base = {
    direction: "inbound",
    status: "ended",
    duration_ms: 4_000,
    disconnection_reason: "user_hangup",
    in_voicemail: false,
    outcome: null,
  };
  assert.equal(
    unansweredCallTodo({ ...base, status: "not_connected", duration_ms: 0 }),
    "Missed call: it rang and never connected. Call them back.",
  );
  assert.equal(unansweredCallTodo(base), "Hung up after 4 sec without a word. Call them back.");
  assert.equal(unansweredCallTodo({ ...base, direction: "outbound", status: "not_connected" }), null);
  assert.equal(unansweredCallTodo({ ...base, in_voicemail: true }), null, "a voicemail has its own row");
  assert.equal(
    unansweredCallTodo({ ...base, transcript_object: [{ role: "user", content: "Hi, is Maria in?" }] }),
    null,
    "they spoke",
  );
});
