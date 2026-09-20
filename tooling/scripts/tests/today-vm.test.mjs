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

test("a quiet morning is proven, not left implied", () => {
  const vm = toTodayVM(metrics(), [], [], [], NOW);
  assert.ok(vm.quiet, "quiet card should be present");
  assert.equal(vm.needsYou, null);
  assert.equal(vm.calls, null);
  assert.match(vm.quiet.sub, /connected/);
  assert.match(vm.quiet.sub, /No messages have arrived yet/);
  // the hero strip still renders — a zero is a real measurement
  assert.equal(vm.recap.facts.length, 4);
  assert.equal(vm.recap.facts[0].value, "0");
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

test("the day's numbers are one sentence: they were six stat cards over two sentences that said them again, and an arc that said the ratio a third time", () => {
  const busy = toTodayVM(metrics({ period: { messages_in: 14, messages_out_ai: 11, messages_out_you: 2, conversations_active: 6, answered_by_ai: 11, median_reply_seconds_ai: 38, calls: 3, call_seconds: 420 } }), [], [], [], NOW);
  assert.equal(busy.recap.line, "14 messages in, 11 answered by the receptionist, typically in 38s. 3 calls, 7 minutes.");
  // Ask reads every sentence; the page prints the line and skips the two the line already says.
  assert.ok(busy.recap.sentences.every((s) => !s.traffic || /receptionist answered|reached the phone line/.test(s.text)), busy.recap.sentences.map((s) => s.text).join(" | "));
  assert.ok(busy.recap.sentences.filter((s) => !s.traffic).every((s) => !/receptionist answered|reached the phone line/.test(s.text)));
  const quiet = toTodayVM(metrics(), [], [], [], NOW);
  assert.equal(quiet.recap.line, "Nothing has come in yet today.");
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

test("the clock comes from the TENANT's timezone, not the reader's", () => {
  const m = metrics();
  m.window.now_local = "2026-08-27T19:30:00"; // evening at the salon
  const vm = toTodayVM(m, [], [], [], NOW);
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

test("zero-traffic facts are honest zeros, never fabrications", () => {
  const m = metrics({ period: { messages_out_you: 1 } });
  const vm = toTodayVM(m, [], [], [], NOW);
  assert.deepEqual(vm.recap.sentences, [{ text: "You sent 1 reply yourself." }]);
  assert.deepEqual(
    vm.recap.facts.map((f) => f.value),
    ["0", "0 of 0", "—", "0"],
  );
});

test("needs-you rows carry the escalation id for the snooze courier", () => {
  const m = metrics({
    now: { escalations_open: 1, oldest_open_escalation_at: "2026-08-27T14:05:00Z" },
    period: { messages_in: 1, conversations_active: 1 },
  });
  const esc = [{
    id: "e-77", conversation_id: "c1", reason: "human_token", details: null,
    state: "open", created_at: "2026-08-27T14:05:00Z",
  }];
  const vm = toTodayVM(m, [conv()], esc, [], NOW);
  assert.equal(vm.needsYou.rows[0].escalationId, "e-77");
});

test("a failed delivery is a warn sentence — never silent", () => {
  const m = metrics({ period: { messages_in: 2, answered_by_ai: 1, conversations_active: 1, send_failures: 1 } });
  const vm = toTodayVM(m, [conv({ state: "open" })], [], [], NOW);
  const warn = vm.recap.sentences.find((x) => x.warn);
  assert.ok(warn, "the send-failure line must carry warn");
  assert.match(warn.text, /failed to deliver — the customer got no answer/);
});

test("calm-day sentences do not read the headline back", () => {
  // headline already says "handled everything — 3 messages…"; repeating the
  // counts as sentences would be the brief quoting its own first line.
  const m = metrics({ period: { messages_in: 3, answered_by_ai: 3, conversations_active: 2, calls: 1, call_seconds: 60 } });
  const vm = toTodayVM(m, [conv({ state: "open" })], [], [], NOW);
  assert.match(vm.standing.headline, /handled everything/);
  assert.equal(vm.recap.sentences.length, 0);
});

test("when something needs you, the traffic narrative moves to sentences", () => {
  const m = metrics({
    now: { escalations_open: 1, oldest_open_escalation_at: "2026-08-27T14:05:00Z" },
    period: { messages_in: 3, answered_by_ai: 2, conversations_active: 2 },
  });
  const esc = [{ id: "e1", conversation_id: "c1", reason: "human_token", details: null, state: "open", created_at: "2026-08-27T14:05:00Z" }];
  const vm = toTodayVM(m, [conv()], esc, [], NOW);
  assert.match(vm.standing.headline, /needs you/);
  assert.ok(vm.recap.sentences.some((x) => /answered 2 messages/.test(x.text)));
});

test("REGRESSION: the day's recap never calls the count a WhatsApp count -- answered_by_ai spans every wire", () => {
  // metrics_summary takes answered_by_ai from first_replies with no channel
  // predicate (00037_hygiene.sql), so a reply the receptionist sent by email
  // is in it. The sentence said "The WhatsApp receptionist answered N
  // messages" over that -- the same lie person-identity.test.mjs pins on a
  // thread's byline, and the same one threadChannelOf exists to end.
  const m = metrics({
    now: { escalations_open: 1, oldest_open_escalation_at: "2026-08-27T14:05:00Z" },
    period: { messages_in: 2, answered_by_ai: 2, conversations_active: 1 },
  });
  const esc = [{ id: "e1", conversation_id: "c1", reason: "human_token", details: null, state: "open", created_at: "2026-08-27T14:05:00Z" }];
  const emailed = conv({ messages: [{ ...conv().messages[0], channel: "email" }] });
  const vm = toTodayVM(m, [emailed], esc, [], NOW);
  const line = vm.recap.sentences.find((s) => /answered/.test(s.text));
  assert.equal(line.text, "The receptionist answered 2 messages from 1 person.");
  assert.ok(
    vm.recap.sentences.every((s) => !/WhatsApp/.test(s.text)),
    vm.recap.sentences.map((s) => s.text).join(" | "),
  );
});

test("the count above the work sees every wire, and calls each one what the owner does", () => {
  const EMAIL = { kind: "email", status: "active", number: null, address: "bestmovers@mail.chanlytics.com" };
  const all = toTodayVM(metrics({ channels: [
    { kind: "whatsapp", status: "active", number: "+19177724072" },
    { kind: "sms", status: "active", number: "+13083368109" },
    EMAIL,
  ] }), [], [], [], NOW);
  assert.deepEqual(all.standing.lines, { text: "3 of 3 lines connected", down: false });
  assert.deepEqual(all.standing.chips.map((c) => c.text), ["WhatsApp connected", "Texting connected", "Email connected"]);
  assert.equal(all.queue.empty.sub, "nothing needs you", "WhatsApp and texts are answered: the reassurance stands");

  // REGRESSION: the sms row a provisioned line writes was printed as its column value.
  const smsOff = toTodayVM(metrics({ channels: [
    { kind: "whatsapp", status: "active", number: "+19177724072" },
    { kind: "sms", status: "disabled", number: "+13083368109" },
    EMAIL,
  ] }), [], [], [], NOW);
  assert.deepEqual(smsOff.standing.lines, { text: "2 of 3 lines connected", down: true });
  assert.equal(smsOff.standing.alert, "Texting is disconnected — messages coming in are not being answered.");
  assert.equal(smsOff.queue.empty.testid, "today-queue-empty-down");

  // REGRESSION: "2 of 2 lines connected" on a workspace whose only line is email.
  const only = toTodayVM(metrics({ channels: [EMAIL] }), [], [], [], NOW);
  assert.deepEqual(only.standing.lines, { text: "1 of 1 line connected", down: false });
  assert.equal(only.quiet.sub, "Email is connected. No messages have arrived yet.");
  assert.ok(only.quiet.proof.some((p) => p.label === "Email" && p.value === "bestmovers@mail.chanlytics.com · on"));
  // and it is not congratulated: the receptionist does not answer email.
  assert.equal(only.queue.empty.testid, "today-queue-empty-unanswered");
  assert.match(only.queue.empty.title, /every email waits for you in the Inbox/);
  assert.equal(only.queue.empty.sub, "nothing in the queue", "the heading does not say 'nothing needs you' over a line nobody answers");

  const none = toTodayVM(metrics({ channels: [] }), [], [], [], NOW);
  assert.deepEqual(none.standing.lines, { text: "no lines connected yet", down: false });
  assert.equal(none.queue.empty.testid, "today-queue-empty-unconnected");

  // A mailbox that could not be read is a line that could not be counted: its own state, never a shorter count.
  const short = toTodayVM({ ...metrics(), linesRead: false }, [], [], [], NOW);
  assert.deepEqual(short.standing.lines, { text: "the email line could not be counted", down: false });
  assert.deepEqual(short.standing.chips.map((c) => c.text), ["WhatsApp connected", "Phone line connected"], "what WAS read still stands");
});

/* ------------------------------ the day's figures, the proof, who is waiting ------------------------------ */

const at = (iso, over = {}) => ({ id: `m-${iso}`, direction: "inbound", sender: "customer", type: "text", body: "Hi, can I book?", media: null, meta: null, status: "received", channel: "whatsapp", created_at: iso, ...over });
const thread = (id, name, messages, over = {}) => ({ id, state: "open", paused_until: null, assignee_user_id: null, assignee_is_me: false, last_wa_inbound_at: null, last_message_at: messages.at(-1)?.created_at ?? null, contact: { id: `k-${id}`, display_name: name, wa_profile_name: null, phone_e164: "+13055550100" }, messages, ...over });
const callRow = (id, over = {}) => ({ id, retell_call_id: `r-${id}`, direction: "inbound", call_type: null, status: "ended", from_e164: "+13475550188", from_raw: null, to_e164: null, started_at: "2026-08-27T13:20:00Z", ended_at: "2026-08-27T13:21:00Z", duration_ms: 60_000, disconnection_reason: "user_hangup", sentiment: "Positive", call_successful: true, in_voicemail: false, summary: "Asked about hours.", transcript_object: null, recording: null, conversation_id: null, contact_id: null, message_id: null, contact: null, ...over });
/** A working day: nine messages, seven answered, two handed over, three calls, two new people. */
const busyDay = () => metrics({
  now: { escalations_open: 2, oldest_open_escalation_at: "2026-08-27T12:50:00Z", last_inbound_at: "2026-08-27T14:38:00Z", last_outbound_at: "2026-08-27T14:38:41Z" },
  period: { messages_in: 9, messages_out_ai: 11, messages_out_you: 1, conversations_active: 6, answered_by_ai: 7, answered_by_you: 1, unanswered_in_window: 1, median_reply_seconds_ai: 34, escalations_new: 2, escalation_reasons: { human_token: 1, non_text: 1 }, calls: 3, call_seconds: 412, call_sentiments: { Positive: 2, Neutral: 1 }, calls_voicemail: 1, new_contacts: 2 },
});
const busyThreads = () => [
  thread("cv-r", "Renata Solís", [at("2026-08-27T09:10:00Z"), at("2026-08-27T09:10:30Z", { direction: "outbound", sender: "ai", status: "delivered" })]),
  thread("cv-m", "Marco Ibáñez", [at("2026-08-27T11:00:00Z", { channel: "email" }), at("2026-08-27T11:02:00Z", { direction: "outbound", sender: "ai", status: "delivered", channel: "email" })]),
  thread("cv-d", "Dulce Amaro", [at("2026-08-20T09:00:00Z", { channel: "sms" }), at("2026-08-20T09:00:20Z", { direction: "outbound", sender: "ai", status: "delivered", channel: "sms" }), at("2026-08-27T12:00:00Z", { channel: "sms" })]),
  thread("cv-a", "Ana Reyes", [at("2026-08-20T09:00:00Z"), at("2026-08-27T14:50:00Z")], { state: "needs_human" }),
];
const busyCalls = () => [callRow("k1", { sentiment: "Positive" }), callRow("k2", { sentiment: "Neutral", started_at: "2026-08-27T12:00:00Z" }), callRow("k3", { in_voicemail: true, sentiment: null, summary: null, contact: { display_name: "Kenia Duarte", wa_profile_name: null, phone_e164: "+13475550199" }, started_at: "2026-08-27T13:50:00Z" })];
/** The two handovers the metrics count, as the escalations read holds them: both opened today, both still open. */
const busyEsc = () => [
  { id: "e-a", conversation_id: "cv-a", reason: "human_token", details: null, state: "open", created_at: "2026-08-27T14:51:00Z" },
  { id: "e-d", conversation_id: "cv-d", reason: "non_text", details: null, state: "open", created_at: "2026-08-27T12:05:00Z" },
];

test("the day's four figures, each with the clause under it and the why behind it", () => {
  const vm = toTodayVM(busyDay(), busyThreads(), busyEsc(), busyCalls(), NOW);
  assert.deepEqual(vm.figures.map((f) => [f.id, f.label, f.value]), [["messages", "customer messages", 9], ["answered", "answered by the receptionist", 7], ["calls", "calls", 3], ["new", "new people", 2]]);
  const by = Object.fromEntries(vm.figures.map((f) => [f.id, f]));
  assert.equal(by.messages.meta, "last at 10:38 AM, answered in 41s", "the proof rides the messages figure");
  // The threads the page holds carry four of today's nine: the receipt says what it counted, by wire, most first.
  assert.deepEqual(by.messages.receipt, { text: "Of the 4 in the Inbox: 2 by WhatsApp, 1 by email and 1 by text.", door: { label: "Open the Inbox", to: "inbox" } }, "never an absolute claim from a partial read");
  assert.equal(by.answered.meta, "typically in 34s, 2 handed over");
  assert.deepEqual(by.answered.receipt, { text: "Handed over twice: once because a customer asked for a person, once for something it can't read. The rest it answered itself. It sent 11 messages in all.", door: { label: "See the handovers", to: "inbox" } }, "the reasons are today's escalations as the page holds them, never period.escalation_reasons, which counts every open one whatever its age");
  assert.equal(by.calls.meta, "7 min on the phone, 1 to voicemail");
  assert.deepEqual(by.calls.receipt, { text: "The voice provider read 2 as positive and 1 as neutral. Kenia Duarte reached voicemail.", door: { label: "Open the calls", to: "conversations/phone" } });
  assert.equal(by.new.meta, "on email and WhatsApp", "the wires the new people wrote on: most first, then by name, the one rule every split here follows");
  assert.deepEqual(by.new.receipt, { text: "Renata Solís and Marco Ibáñez wrote for the first time today.", door: { label: "Open People", to: "clients/seg:new_week" } });
  assert.equal(vm.proof, "The last message arrived 10:38 AM, and the receptionist answered 41s later.");
});

test("a receipt adds to its figure: it never says the figure's own number again", () => {
  const fixtures = [
    toTodayVM(busyDay(), busyThreads(), busyEsc(), busyCalls(), NOW),
    toTodayVM(metrics({ now: { last_inbound_at: "2026-08-27T14:38:00Z", last_outbound_at: "2026-08-27T14:38:41Z" }, period: { messages_in: 4, messages_out_ai: 4, answered_by_ai: 4, median_reply_seconds_ai: 20, calls: 2, call_seconds: 120, call_sentiments: { Positive: 2 }, new_contacts: 1 } }), busyThreads().slice(0, 1), [], [callRow("k1"), callRow("k2")], NOW),
  ];
  for (const vm of fixtures) {
    for (const f of vm.figures) {
      if (!f.receipt) continue;
      assert.doesNotMatch(f.receipt.text, new RegExp(`\\b${f.value}\\b`), `${f.id}: the receipt says ${f.value} again: ${f.receipt.text}`);
    }
  }
  const same = fixtures[1].figures.find((f) => f.id === "answered");
  assert.equal(same.receipt.text, "One reply each.", "four answered with four sent: the count is not said twice");
  const one = fixtures[1].figures.find((f) => f.id === "messages");
  assert.equal(one.receipt.text, "The one the Inbox holds came by WhatsApp.", "one of four held: what it counted, not 'All by WhatsApp'");
  const all = fixtures[1].figures.find((f) => f.id === "calls");
  assert.equal(all.receipt.text, "The voice provider read all of them as positive.", "two of two: not '2 as positive' beside the figure 2");
  const held = toTodayVM(metrics({ period: { messages_in: 1, messages_out_ai: 1, answered_by_ai: 1, conversations_active: 1, new_contacts: 1 } }), busyThreads().slice(0, 1), [], [], NOW);
  assert.equal(held.figures.find((f) => f.id === "messages").receipt.text, "All by WhatsApp.", "one held of one: the whole day, so the absolute is true");
  assert.equal(held.figures.find((f) => f.id === "new").meta, "on WhatsApp");
});

test("the answered receipt is a sentence at every count: both times, each time, all resolved, never a digit", () => {
  const esc = (id, reason, min) => ({ id, conversation_id: `cv-${id}`, reason, details: null, state: "open", created_at: new Date(NOW.getTime() - min * 60_000).toISOString() });
  const fig = (m, escs) => toTodayVM(metrics({ period: m }), [], escs, [], NOW).figures.find((f) => f.id === "answered").receipt.text;
  assert.equal(fig({ messages_in: 6, messages_out_ai: 4, answered_by_ai: 4, conversations_active: 6, escalations_new: 2 }, [esc("a", "human_token", 10), esc("b", "human_token", 20)]),
    "Handed over twice, both times because a customer asked for a person. The rest it answered itself.");
  assert.equal(fig({ messages_in: 6, messages_out_ai: 3, answered_by_ai: 3, conversations_active: 6, escalations_new: 3 }, [esc("a", "non_text", 10), esc("b", "non_text", 20), esc("c", "non_text", 30)]),
    "Handed over three times, each time for something it can't read. The rest it answered itself.");
  assert.equal(fig({ messages_in: 6, messages_out_ai: 3, answered_by_ai: 3, conversations_active: 6, escalations_new: 3 }, [esc("a", "human_token", 10), esc("b", "human_token", 20), esc("c", "refusal", 30)]),
    "Handed over three times: twice because a customer asked for a person, once because it declined to answer. The rest it answered itself.");
  assert.equal(fig({ messages_in: 6, messages_out_ai: 3, answered_by_ai: 3, conversations_active: 6, escalations_new: 3 }, [esc("a", "human_token", 10)]),
    "Handed over three times: once because a customer asked for a person. Two are already resolved. The rest it answered itself.");
  assert.equal(fig({ messages_in: 3, messages_out_ai: 0, answered_by_ai: 0, conversations_active: 3, escalations_new: 1 }, [esc("a", "manual", 10)]),
    "Handed over once, because you flagged it.", "nothing answered: no 'rest' to speak of");
});

test("the sentences stay true where the SQL's counts and the page's rows disagree", () => {
  // Two handovers opened today, both resolved since: the read (state=open) holds neither, and the receipt counts them rather than naming a reason it cannot see.
  const resolved = toTodayVM(busyDay(), busyThreads(), [], busyCalls(), NOW).figures.find((f) => f.id === "answered");
  assert.equal(resolved.meta, "typically in 34s, 2 handed over");
  assert.equal(resolved.receipt.text, "Handed over twice, both already resolved. The rest it answered itself. It sent 11 messages in all.");
  // One reply answered three asks: nothing to say about it.
  const grouped = toTodayVM(metrics({ period: { messages_in: 3, messages_out_ai: 1, answered_by_ai: 3, conversations_active: 1 } }), [], [], [], NOW).figures.find((f) => f.id === "answered");
  assert.equal(grouped.meta, "none handed over");
  assert.equal(grouped.receipt, null, "REGRESSION: 'One reply each.' over one reply to three messages");
  // One call: "it", not "all of them".
  const single = toTodayVM(metrics({ period: { calls: 1, call_seconds: 90, call_sentiments: { Positive: 1 } } }), [], [], [callRow("k1")], NOW).figures.find((f) => f.id === "calls");
  assert.equal(single.receipt.text, "The voice provider read it as positive.");
  // Every call to voicemail, nobody on the phone; the same number twice is one caller; a withheld caller is counted, never named.
  const vmail = [callRow("v1", { in_voicemail: true, sentiment: null, duration_ms: 0 }), callRow("v2", { in_voicemail: true, sentiment: null, duration_ms: 0 }), callRow("v3", { in_voicemail: true, sentiment: null, duration_ms: 0, from_e164: null, contact: null })];
  const voicemail = toTodayVM(metrics({ period: { calls: 3, call_seconds: 0, call_sentiments: {}, calls_voicemail: 3 } }), [], [], vmail, NOW).figures.find((f) => f.id === "calls");
  assert.equal(voicemail.meta, "3 to voicemail", "REGRESSION: 'under a minute on the phone' with nobody on the phone");
  assert.equal(voicemail.receipt.text, "+1 (347) 555-0188 reached voicemail.", "one caller, once; the withheld one is in the clause's count");
  // A person who existed before and wrote for the first time today is not new: no name beside "nobody new yet".
  const notNew = toTodayVM(metrics({ period: { messages_in: 1, messages_out_ai: 1, answered_by_ai: 1, conversations_active: 1, new_contacts: 0 } }), busyThreads().slice(0, 1), [], [], NOW).figures.find((f) => f.id === "new");
  assert.deepEqual([notNew.meta, notNew.receipt], ["nobody new yet", null], "REGRESSION: 'nobody new yet' beside a named person");
  // Two new people counted, one thread held: no wire claimed for two from one, no name for the one the page cannot see.
  const partial = toTodayVM(metrics({ period: { messages_in: 2, messages_out_ai: 2, answered_by_ai: 2, conversations_active: 2, new_contacts: 2 } }), busyThreads().slice(0, 1), [], [], NOW).figures.find((f) => f.id === "new");
  assert.deepEqual([partial.meta, partial.receipt], ["first contact today", null]);
  // Four new people, all held: three named, the fourth counted.
  const four = busyThreads().slice(0, 2).concat([thread("cv-n3", "Noor Haddad", [at("2026-08-27T10:00:00Z")]), thread("cv-n4", "Iris Kowalski", [at("2026-08-27T10:30:00Z")])]);
  const many = toTodayVM(metrics({ period: { messages_in: 4, conversations_active: 4, new_contacts: 4 } }), four, [], [], NOW).figures.find((f) => f.id === "new");
  assert.equal(many.receipt.text, "Renata Solís, Marco Ibáñez, Noor Haddad and 1 more wrote for the first time today.", "one 'and', as andList says it");
  assert.equal(many.meta, "on WhatsApp and email", "three on WhatsApp, one by email: most first");
  // A handover opened today that a teammate has taken over is still open: named by its reason, never counted as resolved.
  const claimed = busyThreads().map((c) => (c.id === "cv-a" ? { ...c, assignee_user_id: "u-teammate", assignee_is_me: false } : c));
  const taken = toTodayVM(metrics({ period: { messages_in: 2, messages_out_ai: 2, answered_by_ai: 2, conversations_active: 2, escalations_new: 1 } }), claimed, [busyEsc()[0]], [], NOW).figures.find((f) => f.id === "answered");
  assert.equal(taken.receipt.text, "Handed over once, because a customer asked for a person. The rest it answered itself.", "REGRESSION: '1 handover already resolved' over a colleague mid-reply");
  // Two of nine held, both by WhatsApp: what the page holds, said once.
  const twoHeld = toTodayVM(busyDay(), [busyThreads()[0], thread("cv-b", "Bea Lind", [at("2026-08-27T12:30:00Z")])], [], [], NOW).figures.find((f) => f.id === "messages");
  assert.equal(twoHeld.receipt.text, "The 2 the Inbox holds both came by WhatsApp.", "REGRESSION: 'Of the 2 in the Inbox: 2 by WhatsApp.'");
});

test("a figure with nothing to add has no receipt; a day with nothing at all has no figures, and the proof is still said", () => {
  // The SQL counted one message nobody has answered; the conversations read holds no thread for it, so there is nothing to split.
  const thin = toTodayVM(metrics({ period: { messages_in: 1, conversations_active: 1 } }), [], [], [], NOW);
  const by = Object.fromEntries(thin.figures.map((f) => [f.id, f]));
  assert.equal(by.messages.meta, "none yet", "no last_inbound_at in this read");
  assert.equal(by.messages.receipt, null, "no thread to split by wire");
  assert.equal(by.answered.meta, "none answered yet", "a message came in and nothing answered it yet");
  assert.equal(by.answered.receipt, null, "no handover, nothing sent");
  assert.equal(by.calls.meta, "none yet");
  assert.equal(by.calls.receipt, null);
  assert.equal(by.new.meta, "nobody new yet");
  assert.equal(by.new.receipt, null);
  const none = toTodayVM(metrics(), [], [], [], NOW);
  assert.equal(none.figures, null, "no row of zeros");
  assert.equal(none.proof, "No messages have arrived yet.");
  assert.ok(none.quiet.sub.endsWith(" connected. No messages have arrived yet."), `the quiet card's sentence ends with the same proof: ${none.quiet.sub}`);
  const quietLater = toTodayVM(metrics({ now: { last_inbound_at: "2026-08-26T21:39:00Z", last_outbound_at: "2026-08-26T21:40:18Z" } }), [], [], [], NOW);
  assert.equal(quietLater.proof, "The last message arrived yesterday at 5:39 PM, and the receptionist answered 1m 18s later.");
  assert.ok(quietLater.quiet.sub.endsWith(quietLater.proof), quietLater.quiet.sub);
  for (const vm of [thin, none]) for (const gone of ["pulse", "launchpad", "updatedAt"]) assert.ok(!(gone in vm), `${gone} has no reader`);
  assert.ok(!("greeting" in none.standing), "no greeting above the work");
});

test("who is waiting with nothing back: the customer wrote last an hour ago or more, nobody replied, nobody holds the thread, and it is not the queue's", () => {
  const vm = toTodayVM(busyDay(), busyThreads(), [], busyCalls(), NOW);
  assert.deepEqual(vm.noReply.map((r) => [r.who, r.conversationId, r.to]), [["Dulce Amaro", "cv-d", "inbox/th-cv-d"]], "Dulce wrote at 8am with nothing back; Ana wrote ten minutes ago and may still get her answer");
  assert.equal(vm.noReply[0].sinceMs, Date.parse("2026-08-27T12:00:00Z"));
  const esc = [{ id: "e1", conversation_id: "cv-d", reason: "human_token", details: null, state: "open", created_at: "2026-08-27T12:05:00Z" }];
  assert.deepEqual(toTodayVM(busyDay(), busyThreads(), esc, busyCalls(), NOW).noReply, [], "a thread the queue holds is not said twice");
  const snoozed = busyThreads().map((c) => (c.id === "cv-d" ? { ...c, state: "snoozed" } : c));
  assert.deepEqual(toTodayVM(busyDay(), snoozed, [], busyCalls(), NOW).noReply, [], "a snoozed thread waits on purpose");
  // A teammate has it (standing.ts: a flagged thread with a claim is theirs), or a person paused the receptionist to reply themselves: not waiting on nobody.
  const theirs = busyThreads().map((c) => (c.id === "cv-d" ? { ...c, state: "needs_human", assignee_user_id: "u-teammate", assignee_is_me: false } : c));
  assert.deepEqual(toTodayVM(busyDay(), theirs, [], busyCalls(), NOW).noReply, [], "REGRESSION: a thread a colleague is answering, listed as ignored");
  const paused = busyThreads().map((c) => (c.id === "cv-d" ? { ...c, paused_until: "2026-08-27T18:00:00Z" } : c));
  assert.deepEqual(toTodayVM(busyDay(), paused, [], busyCalls(), NOW).noReply, [], "a person is on it");
  const archived = busyThreads().map((c) => (c.id === "cv-d" ? { ...c, state: "archived" } : c));
  assert.deepEqual(toTodayVM(busyDay(), archived, [], busyCalls(), NOW).noReply, [], "REGRESSION: a filed-away thread listed as waiting");
  const two = busyThreads().map((c) => (c.id === "cv-a" ? { ...c, state: "open", messages: [at("2026-08-27T09:00:00Z"), at("2026-08-27T11:30:00Z")] } : c));
  assert.deepEqual(toTodayVM(busyDay(), two, [], busyCalls(), NOW).noReply.map((r) => r.who), ["Ana Reyes", "Dulce Amaro"], "oldest wait first");
});

test("one reading of each escalation: Ask's row and the queue's row agree, and a call-back carries the to-do it left", () => {
  const cb = [{ id: "e2", conversation_id: "cv-k", reason: "callback", details: "Call back to confirm Saturday 10:00.", state: "open", created_at: "2026-08-27T14:30:00Z" }];
  const kenia = thread("cv-k", "Kenia Duarte", [], { state: "needs_human" });
  const call = callRow("k9", { conversation_id: "cv-k", started_at: "2026-08-27T14:20:00Z", wanted: "Asked for a gel manicure Saturday.", outcome: "callback_needed" });
  const vm = toTodayVM(busyDay(), [...busyThreads(), kenia], cb, [...busyCalls(), call], NOW);
  const ask = vm.needsYou.rows[0];
  const queue = vm.queue.rows.find((r) => r.kind === "callback");
  assert.equal(ask.who, queue.who);
  assert.equal(ask.quote, "Call back to confirm Saturday 10:00.", "the to-do the phone receptionist left, which Ask never saw");
  assert.equal(ask.meta, "Phone · +1 (305) 555-0100");
  assert.deepEqual([queue.conversationId, queue.callId], ["cv-k", "k9"], "the row says which thread and which call it is about");
  assert.deepEqual([queue.sentence, queue.cta.to], ["Call back to confirm Saturday 10:00.", "conversations/cv-k9"]);
  const handoff = toTodayVM(busyDay(), busyThreads(), [{ id: "e3", conversation_id: "cv-a", reason: "human_token", details: null, state: "open", created_at: "2026-08-27T14:51:00Z" }], [], NOW);
  assert.deepEqual([handoff.queue.rows[0].conversationId, handoff.queue.rows[0].callId], ["cv-a", null]);
  assert.equal(handoff.needsYou.rows[0].quote, "Hi, can I book?", "the customer's own words first");
  const ear = toTodayVM(busyDay(), busyThreads(), [], busyCalls(), NOW).queue.rows.find((r) => r.kind === "call");
  assert.deepEqual([ear.callId, ear.conversationId], ["k3", null], "a call worth a listen names its call");
});
