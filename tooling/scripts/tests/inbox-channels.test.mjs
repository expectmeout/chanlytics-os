/**
 * The Inbox by channel and by reason: a caller with no WhatsApp thread gets
 * phone verbs, the banner says the reason's own sentence, and Conversations'
 * pills say what they mean.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, contactMeta } from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const NOW = new Date("2026-09-06T23:00:00Z");
const conv = (over = {}) => ({
  id: "c1", state: "needs_human", paused_until: "2026-09-07T19:00:00Z", snooze_until: null,
  assignee_user_id: null, assignee_is_me: undefined,
  last_wa_inbound_at: null, last_message_at: "2026-09-06T22:03:00Z",
  contact: { id: "k1", display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106", consent: "unknown", dnc: false },
  messages: [{ id: "m1", direction: "inbound", sender: "system", type: "call_summary", body: "Inbound call · 3 min — arranged a bridal trial", media: null, meta: {}, status: "received", created_at: "2026-09-06T22:03:00Z" }],
  ...over,
});
const callback = { id: "e1", reason: "callback", state: "open", created_at: "2026-09-06T22:04:00Z", details: "Call Emily back to confirm the bridal trial on Oct 3" };

test("a caller with no WhatsApp thread: phone is the channel, no reply window, the number to call, the reason's own sentence", () => {
  const vm = toInboxThreadVM(conv(), callback, ZONE, NOW);
  assert.deepEqual([vm.channels, vm.primaryChannel, vm.hasChat, vm.phone], [["phone"], "phone", false, "+19175550106"]);
  assert.equal(vm.whoMeta, "Phone · +1 (917) 555-0106");
  assert.equal(vm.summary, "They phoned and the receptionist couldn't finish it.", "the sentence says why; the button says what to do about it");
  assert.equal(vm.waited, "56m");
});

test("a WhatsApp thread keeps its window, and a thread with both keeps both channels", () => {
  const chat = toInboxThreadVM(conv({ last_wa_inbound_at: "2026-09-06T22:00:00Z", messages: [{ id: "m2", direction: "inbound", sender: "customer", type: "text", body: "hi", media: null, meta: {}, status: "received", created_at: "2026-09-06T22:00:00Z" }] }), null, ZONE, NOW);
  assert.deepEqual([chat.channels, chat.primaryChannel, chat.hasChat], [["whatsapp"], "whatsapp", true]);
  assert.equal(chat.windowOpen, true, "they wrote an hour ago: the window is open");
  const both = toInboxThreadVM(conv({ last_wa_inbound_at: "2026-09-06T22:00:00Z", messages: [...conv().messages, { id: "m2", direction: "inbound", sender: "customer", type: "text", body: "hi", media: null, meta: {}, status: "received", created_at: "2026-09-06T22:10:00Z" }] }), null, ZONE, NOW);
  assert.deepEqual([both.channels, both.primaryChannel], [["whatsapp", "phone"], "whatsapp"]);
  assert.equal(contactMeta(conv()), "WhatsApp · +1 (917) 555-0106", "the default stays what Today's rows print");
});

test("the wiring: the page branches on the channel and reads the reason's sentence; the pills say what they mean", () => {
  const page = readCode("apps/dashboard/src/legacy/pages/inbox-thread.jsx");
  for (const s of ["Needs you{thread.waited ? <span className={`ix-take-wait${thread.waitingMin > 30 ? \" late\" : \"\"}`}>{` · waited ${thread.waited}`}</span> : \"\"}", "<>{thread.summary}</>", "Call back", 'aria-label="Nothing needed — hand it back to the receptionist"', "thread.hasChat === false", 'data-testid="ix-call-back"', "`${thread.primaryChannel === \"sms\" ? \"Text\" : \"WhatsApp\"} to ${thread.who}…`"]) assert.ok(page.includes(s), s);
  for (const gone of ["already sent a holding reply", "let the AI resume", "Reply as the salon", "Waiting on you{thread.waitingMin", "They have only phoned", "Call them back"]) assert.ok(!page.includes(gone), `${gone} is gone`);
  const pills = readCode("apps/dashboard/src/legacy/pages/conversations.jsx");
  // The words and the tones are the one pill's now (contracts/tone.ts, run in state-pill.test.mjs); the page names the states.
  assert.ok(pills.includes('<StatePill kind="thread" value="open" />') && pills.includes('<StatePill kind="thread" value="escalated" />') && !pills.includes("Customer's turn"));
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/surface-data.ts").includes('whatsapp: "WhatsApp", phone: "Phone"'), "the phone chip has a label");
});
