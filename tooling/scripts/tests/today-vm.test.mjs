/** Honesty tests for the Today viewmodel. Every case here is a way the brief
 *  could lie to a salon owner at 9am, pinned so a refactor can't reintroduce it.
 *  Run: node --test tooling/scripts/tests/*.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM } from "@chanlytics/contracts";

const NOW = new Date("2026-08-27T15:00:00Z"); // 11:00 America/New_York

const metrics = (over = {}) => ({
  workspace: { name: "Melany's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [
    { kind: "whatsapp", status: "active", number: "+19177724072" },
    { kind: "voice", status: "active", number: "+13083368109" },
  ],
  window: {
    days: 1,
    since: "2026-08-27T04:00:00+00:00",
    since_local: "2026-08-27T00:00:00",
    now_local: "2026-08-27T11:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
    ...(over.now ?? {}),
  },
  period: {
    messages_in: 0, messages_out_ai: 0, messages_out_you: 0,
    conversations_active: 0, answered_by_ai: 0, answered_by_you: 0,
    unanswered_in_window: 0, median_reply_seconds_ai: null, send_failures: 0,
    escalations_new: 0, escalation_reasons: {},
    calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0,
    new_contacts: 0,
    ...(over.period ?? {}),
  },
  ...(over.workspace ? { workspace: over.workspace } : {}),
  ...(over.channels ? { channels: over.channels } : {}),
});

const conv = (over = {}) => ({
  id: "c1",
  state: "needs_human",
  paused_until: null,
  last_wa_inbound_at: "2026-08-27T14:00:00Z",
  last_message_at: "2026-08-27T14:00:00Z",
  contact: { id: "k1", display_name: "Priya", wa_profile_name: null, phone_e164: "+13055550142" },
  messages: [
    {
      id: "m1", direction: "inbound", sender: "customer", type: "text",
      body: "Do you do gel refills on Tuesdays?", media: null, meta: null,
      status: "received", created_at: "2026-08-27T14:00:00Z",
    },
  ],
  ...over,
});

test("a quiet morning is proven, not rendered as zeroes", () => {
  const vm = toTodayVM(metrics(), [], [], [], NOW);
  assert.ok(vm.quiet, "quiet card should be present");
  assert.equal(vm.recap, null, "no recap region on a day with no traffic");
  assert.equal(vm.needsYou, null);
  assert.equal(vm.calls, null);
  assert.match(vm.quiet.sub, /connected/);
  assert.match(vm.quiet.sub, /No messages have arrived yet/);
});

test("a disconnected channel never reads as a calm morning", () => {
  const m = metrics();
  m.channels[0].status = "disabled";
  const vm = toTodayVM(m, [], [], [], NOW);
  assert.equal(vm.quiet, null, "zero traffic behind a dark number is NOT quiet");
  assert.match(vm.standing.alert, /WhatsApp is disconnected/);
  assert.equal(vm.standing.tone, "alert");
  // the reassuring headline must be suppressed entirely
  assert.doesNotMatch(vm.standing.headline, /Nothing needs you/);
});

test("a paused workspace says so before anything else", () => {
  const m = metrics();
  m.workspace = { ...m.workspace, status: "paused" };
  const vm = toTodayVM(m, [], [], [], NOW);
  assert.match(vm.standing.alert, /workspace is paused/);
  assert.equal(vm.quiet, null);
});

test("an overnight wait reads as hours, never as '561 min'", () => {
  const m = metrics({
    now: { escalations_open: 1, oldest_open_escalation_at: "2026-08-27T03:42:00Z" },
    period: { messages_in: 1, conversations_active: 1 },
  });
  const esc = [{
    id: "e1", conversation_id: "c1", reason: "human_token", details: null,
    state: "open", created_at: "2026-08-27T03:42:00Z",
  }];
  const vm = toTodayVM(m, [conv()], esc, [], NOW);
  assert.equal(vm.needsYou.rows.length, 1);
  assert.equal(vm.needsYou.rows[0].waited, "11h");
  assert.equal(vm.needsYou.rows[0].warn, true);
  assert.match(vm.standing.headline, /One conversation needs you/);
});

test("the needs-you row quotes the customer's own words", () => {
  const m = metrics({
    now: { escalations_open: 1, oldest_open_escalation_at: "2026-08-27T14:05:00Z" },
    period: { messages_in: 1, conversations_active: 1 },
  });
  const esc = [{
    id: "e1", conversation_id: "c1", reason: "policy_block", details: null,
    state: "open", created_at: "2026-08-27T14:05:00Z",
  }];
  const vm = toTodayVM(m, [conv()], esc, [], NOW);
  assert.equal(vm.needsYou.rows[0].quote, "Do you do gel refills on Tuesdays?");
  assert.equal(vm.needsYou.rows[0].to, "inbox/th-c1");
});

test("a null median reply time renders '—', never '0s'", () => {
  const m = metrics({ period: { messages_in: 2, conversations_active: 1, median_reply_seconds_ai: null } });
  const vm = toTodayVM(m, [conv({ state: "open" })], [], [], NOW);
  const fact = vm.recap.facts.find((f) => f.label === "Typical reply time");
  assert.equal(fact.value, "—");
  assert.equal(fact.hint, "Not enough replies yet");
});

test("no fact carries a delta, a percentage or a sparkline", () => {
  const m = metrics({ period: { messages_in: 3, answered_by_ai: 3, conversations_active: 2, median_reply_seconds_ai: 41 } });
  const vm = toTodayVM(m, [conv({ state: "open" })], [], [], NOW);
  for (const f of vm.recap.facts) {
    assert.equal(f.spark, undefined);
    assert.equal(f.delta, undefined);
    assert.doesNotMatch(f.value, /%|↑|↓|vs\./);
  }
});

test("the reply-window region is absent when nothing is closing", () => {
  const m = metrics({ period: { messages_in: 1, conversations_active: 1 } });
  // last_wa_inbound_at is 1h old, so ~23h of window remain — not "closing"
  const vm = toTodayVM(m, [conv({ state: "open" })], [], [], NOW);
  assert.equal(vm.windowClosing, null);
});

test("the reply-window region appears when the window is nearly up", () => {
  const m = metrics({ period: { messages_in: 1, conversations_active: 1 } });
  const c = conv({ state: "open", last_wa_inbound_at: "2026-08-26T16:00:00Z" }); // closes in ~2h
  const vm = toTodayVM(m, [c], [], [], NOW);
  assert.ok(vm.windowClosing);
  assert.equal(vm.windowClosing.rows.length, 1);
  assert.match(vm.windowClosing.rows[0].text, /window closes/);
});

test("calls: aggregate always, rows only for the ones needing an ear", () => {
  const m = metrics({ period: { calls: 2, call_seconds: 200 } });
  const calls = [
    { id: "k1", retell_call_id: "r1", direction: "inbound", call_type: null, status: "ended",
      from_e164: "+13473015373", from_raw: null, to_e164: null,
      started_at: "2026-08-27T13:00:00Z", ended_at: null, duration_ms: 100000,
      disconnection_reason: "user_hangup", sentiment: "Positive", call_successful: true,
      in_voicemail: false, summary: "Asked about hours.", transcript_object: null,
      recording: null, conversation_id: null, contact_id: null, message_id: null, contact: null },
    { id: "k2", retell_call_id: "r2", direction: "inbound", call_type: null, status: "ended",
      from_e164: "+13473015374", from_raw: null, to_e164: null,
      started_at: "2026-08-27T13:30:00Z", ended_at: null, duration_ms: 100000,
      disconnection_reason: "user_hangup", sentiment: "Negative", call_successful: false,
      in_voicemail: false, summary: "Complaint about wait.", transcript_object: null,
      recording: null, conversation_id: null, contact_id: null, message_id: null, contact: null },
  ];
  const vm = toTodayVM(m, [], [], calls, NOW);
  assert.match(vm.calls.line, /2 calls today/);
  assert.equal(vm.calls.rows.length, 1, "only the negative-sentiment call needs an ear");
  assert.match(vm.calls.rows[0].note, /the voice provider's own read/);
});

test("sentiment is always attributed to the provider, never asserted as fact", () => {
  const m = metrics({ period: { calls: 1, call_seconds: 100 } });
  const calls = [{
    id: "k1", retell_call_id: "r1", direction: "inbound", call_type: null, status: "ended",
    from_e164: "+1", from_raw: null, to_e164: null, started_at: "2026-08-27T13:00:00Z",
    ended_at: null, duration_ms: 100000, disconnection_reason: null, sentiment: "Negative",
    call_successful: null, in_voicemail: false, summary: "x", transcript_object: null,
    recording: null, conversation_id: null, contact_id: null, message_id: null, contact: null,
  }];
  const vm = toTodayVM(m, [], [], calls, NOW);
  assert.match(vm.calls.rows[0].note, /voice provider/);
});

test("clock and greeting come from the TENANT's timezone, not the reader's", () => {
  const m = metrics();
  m.window.now_local = "2026-08-27T19:30:00"; // evening at the salon
  const vm = toTodayVM(m, [], [], [], NOW);
  assert.equal(vm.standing.greeting, "Good evening.");
  assert.match(vm.standing.eyebrow, /7:30 PM/);
  assert.match(vm.standing.eyebrow, /Melany's Beauty Salon/);
});

test("receipts quote the outbound message verbatim, not a summary of it", () => {
  const m = metrics({ period: { messages_in: 1, messages_out_ai: 1, answered_by_ai: 1, conversations_active: 1 } });
  const c = conv({
    state: "open",
    messages: [
      { id: "m1", direction: "inbound", sender: "customer", type: "text",
        body: "Do you do gel refills?", media: null, meta: null,
        status: "received", created_at: "2026-08-27T14:00:00Z" },
      { id: "m2", direction: "outbound", sender: "ai", type: "text",
        body: "Yes, we do gel refills — Tuesday or Thursday work well.", media: null, meta: null,
        status: "delivered", created_at: "2026-08-27T14:00:41Z" },
    ],
  });
  const vm = toTodayVM(m, [c], [], [], NOW);
  assert.equal(vm.recap.receipts.length, 1);
  assert.match(vm.recap.receipts[0].text, /Yes, we do gel refills/);
  assert.equal(vm.recap.receipts[0].to, "inbox/th-c1");
});

test("a canceled outbound message is never shown as a reply that went out", () => {
  const m = metrics({ period: { messages_in: 1, conversations_active: 1 } });
  const c = conv({
    state: "open",
    messages: [
      { id: "m1", direction: "inbound", sender: "customer", type: "text", body: "hi",
        media: null, meta: null, status: "received", created_at: "2026-08-27T14:00:00Z" },
      { id: "m2", direction: "outbound", sender: "human", type: "text", body: "never sent",
        media: null, meta: null, status: "canceled", created_at: "2026-08-27T14:01:00Z" },
    ],
  });
  const vm = toTodayVM(m, [c], [], [], NOW);
  assert.equal(vm.recap.receipts.length, 0);
});

test("a backfilled reply is never quoted as sent today", () => {
  // The import stamped created_at with the moment it RAN, so these rows would
  // otherwise render weeks-old replies as "1:59 AM today".
  const m = metrics({ period: { messages_in: 1, conversations_active: 1 } });
  const c = conv({
    state: "open",
    messages: [
      { id: "m1", direction: "outbound", sender: "ai", type: "text",
        body: "imported from the old thread", media: null, meta: { backfill: true },
        status: "sent", created_at: "2026-08-27T05:59:41Z" },
    ],
  });
  const vm = toTodayVM(m, [c], [], [], NOW);
  assert.equal(vm.recap.receipts.length, 0);
});

test("no inbound traffic means no row of zeroes", () => {
  // one human reply is traffic enough to show the recap sentence, but the
  // fact strip would read 0 / "0 of 0" / — / 0 across the board.
  const m = metrics({ period: { messages_out_you: 1 } });
  const vm = toTodayVM(m, [], [], [], NOW);
  assert.equal(vm.recap.facts.length, 0);
  assert.deepEqual(vm.recap.sentences, ["You sent 1 reply yourself."]);
});
