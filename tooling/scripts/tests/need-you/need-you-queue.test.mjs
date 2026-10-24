/**
 * The queue's rows as Need you works them (decision 0071), run through contracts' toTodayVM: the receptionist's reply
 * counting down is a row of its own and stands first, until its deadline passes or the thread is held; and each row a
 * reply is written for says what the reply answers and goes by (their newest message, the thread's wire, WhatsApp's
 * window), so Ask's draft is asked for that message and a closed window is said before a send.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEED_YOU_WORDS, toTodayVM } from "@chanlytics/contracts";

// 10:00 in New York on Sunday 6 September 2026.
const NOW = new Date("2026-09-06T14:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const dayMetrics = () => ({
  workspace: { name: "Example Studio", timezone: "America/New_York", status: "active" },
  channels: [
    { kind: "whatsapp", status: "active", number: "+1 305" },
    { kind: "sms", status: "active", number: "+1 786" },
  ],
  window: {
    days: 1,
    since: "2026-09-06T04:00:00Z",
    since_local: "2026-09-06T00:00:00",
    now_local: "2026-09-06T10:00:00",
  },
  now: {
    escalations_open: 1,
    oldest_open_escalation_at: ago(HOUR),
    threads_needing_human: 1,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: ago(MIN),
    last_outbound_at: ago(MIN),
  },
  period: {
    messages_in: 3,
    messages_out_ai: 1,
    messages_out_you: 0,
    conversations_active: 3,
    answered_by_ai: 1,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: 40,
    send_failures: 0,
    escalations_new: 1,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
});
const someone = (id, name, phone) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: phone,
  consent: "opted_in",
  dnc: false,
});
/** A message on a thread: the customer's, or the receptionist's, held (`queued`, its veto `delay_ms`) or sent. */
const wrote = (id, sender, body, at, channel = "whatsapp", over = {}) => ({
  id,
  conversation_id: "x",
  direction: sender === "customer" ? "inbound" : "outbound",
  sender,
  channel,
  type: "text",
  body,
  media: null,
  meta: null,
  status: sender === "customer" ? "received" : "sent",
  created_at: at,
  ...over,
});
const thread = (id, who, messages, over = {}) => ({
  id,
  state: "open",
  paused_until: null,
  last_wa_inbound_at: null,
  last_message_at: messages.at(-1)?.created_at ?? ago(HOUR),
  contact: someone(`k-${id}`, who, "+13055550101"),
  messages,
  ...over,
});
/** The receptionist's reply to Maya, held ten minutes for a veto from a minute ago. */
const held = (over = {}) =>
  wrote("m-held", "ai", "Hi Maya! Saturday at 10:00 is open.", ago(MIN), "whatsapp", {
    status: "queued",
    meta: { delay_ms: 10 * MIN },
    ...over,
  });
const maya = (messages) => thread("cv-maya", "Maya Brooks", messages, { last_wa_inbound_at: ago(3 * MIN) });
const asked = wrote("m-maya", "customer", "Anything Saturday morning?", ago(3 * MIN));
const hold = (id, conversation, reason, at) => ({
  id,
  reason,
  details: null,
  state: "open",
  created_at: at,
  conversation_id: conversation,
});

test("the receptionist's reply counting down is a row of its own, first, with its words and when it goes", () => {
  const jordan = thread(
    "cv-jordan",
    "Jordan Avery",
    [wrote("m-j", "customer", "Charged twice?", ago(2 * HOUR), "sms")],
    {
      state: "needs_human",
    },
  );
  const vm = toTodayVM(
    dayMetrics(),
    [maya([asked, held()]), jordan],
    [hold("e-j", "cv-jordan", "human_token", ago(2 * HOUR))],
    [],
    NOW,
  );
  const [first, second] = vm.queue.rows;
  assert.equal(first.kind, "held", "it goes on its own in minutes, so it stands before everyone waiting");
  assert.equal(first.id, "q-h-cv-maya");
  assert.deepEqual(first.status, [NEED_YOU_WORDS.held.goesAlone]);
  assert.equal(first.sentence, "Anything Saturday morning?", "their words are the sentence");
  assert.deepEqual(first.held, {
    message_id: "m-held",
    text: "Hi Maya! Saturday at 10:00 is open.",
    sends_at_ms: Date.parse(ago(MIN)) + 10 * MIN,
  });
  assert.equal(second.kind, "handoff");
});

test("no row for a reply whose deadline has passed: it is going out, not waiting", () => {
  const late = held({ created_at: ago(11 * MIN) });
  const vm = toTodayVM(dayMetrics(), [maya([asked, late])], [], [], NOW);
  assert.equal(
    vm.queue.rows.some((r) => r.kind === "held"),
    false,
  );
});

test("a held thread's reply is the handoff's to say: one row for one person", () => {
  const vm = toTodayVM(
    dayMetrics(),
    [maya([asked, held()])],
    [hold("e-m", "cv-maya", "human_token", ago(2 * MIN))],
    [],
    NOW,
  );
  assert.deepEqual(
    vm.queue.rows.map((r) => r.kind),
    ["handoff"],
  );
});

test("a reply counting down on a thread whose window is closing is one row, the held one, which says when the window shuts", () => {
  const late = thread(
    "cv-sam",
    "Sam Ortiz",
    [
      wrote("m-s", "customer", "Could you send the aftercare tips?", ago(21 * HOUR)),
      held({ id: "m-sh", body: "Of course! Here they are.", conversation_id: "cv-sam" }),
    ],
    { last_wa_inbound_at: ago(21 * HOUR) },
  );
  const vm = toTodayVM(dayMetrics(), [late], [], [], NOW);
  assert.deepEqual(
    vm.queue.rows.map((r) => r.kind),
    ["held"],
    "its window closing is said on the held row, never as a second row for the same person",
  );
  assert.equal(vm.queue.rows[0].writes.window_closes, "1:00 PM");
  assert.equal(vm.queue.windows, 0, "and the head counts no window closing for it");
});

test("a reply row says what its reply answers and goes by: their newest message, the wire, WhatsApp's window", () => {
  const open = thread(
    "cv-sam",
    "Sam Ortiz",
    [
      wrote("m-s1", "customer", "Loved it!", ago(21 * HOUR + 5 * MIN)),
      wrote("m-s2", "customer", "Could you send the aftercare tips?", ago(21 * HOUR)),
    ],
    { last_wa_inbound_at: ago(21 * HOUR) },
  );
  const closed = thread(
    "cv-chris",
    "Chris Patel",
    [wrote("m-c", "customer", "Same price as last time?", ago(30 * HOUR))],
    {
      state: "needs_human",
      last_wa_inbound_at: ago(30 * HOUR),
    },
  );
  const texted = thread("cv-ana", "Ana Silva", [wrote("m-a", "customer", "Saturday at 10?", ago(HOUR), "sms")], {
    state: "needs_human",
  });
  const vm = toTodayVM(
    dayMetrics(),
    [open, closed, texted],
    [hold("e-c", "cv-chris", "policy_ask", ago(29 * HOUR)), hold("e-a", "cv-ana", "human_token", ago(HOUR))],
    [],
    NOW,
  );
  const of = (id) => vm.queue.rows.find((r) => r.conversationId === id);
  assert.equal(of("cv-sam").kind, "window");
  assert.deepEqual(of("cv-sam").writes, {
    for_message_id: "m-s2",
    wire: "WhatsApp",
    window_open: true,
    window_closes: "1:00 PM",
  });
  assert.deepEqual(of("cv-chris").writes, {
    for_message_id: "m-c",
    wire: "WhatsApp",
    window_open: false,
    window_closes: null,
  });
  assert.deepEqual(
    of("cv-ana").writes,
    { for_message_id: "m-a", wire: "Text", window_open: null, window_closes: null },
    "a text has no window",
  );
  assert.equal(
    of("cv-chris").reason,
    "Set to Ask me first — a person answers this one",
    "why it was handed over, for Ask's draft",
  );
});
