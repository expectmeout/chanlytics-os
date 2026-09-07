/**
 * Today's queue: everything that asks for a person, in one row grammar —
 * WhatsApp handoffs, callers who need a call back, reply windows closing,
 * calls worth an ear — the longest wait first, capped, each with its one verb
 * and, where the state asks it, a second. The hero keeps the narrative; the
 * rows live in the queue, drawn by the same component as People's strip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

// 10:00 in New York on Sunday 6 September 2026.
const NOW = new Date("2026-09-06T14:00:00Z");

const metrics = (over = {}) => ({
  workspace: { name: "Melany's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }, { kind: "voice", status: "active", number: "+1 786" }],
  window: { days: 1, since: "2026-09-06T04:00:00Z", since_local: "2026-09-06T00:00:00", now_local: "2026-09-06T10:00:00" },
  now: { escalations_open: 2, oldest_open_escalation_at: "2026-09-06T12:00:00Z", threads_needing_human: 2, threads_snoozed: 0, threads_awaiting_reply: 0, last_inbound_at: "2026-09-06T13:00:00Z", last_outbound_at: "2026-09-06T13:01:00Z" },
  period: { messages_in: 5, messages_out_ai: 4, messages_out_you: 0, conversations_active: 3, answered_by_ai: 4, answered_by_you: 0, unanswered_in_window: 1, median_reply_seconds_ai: 40, send_failures: 0, escalations_new: 2, escalation_reasons: {}, calls: 2, call_seconds: 300, call_sentiments: {}, calls_voicemail: 1, new_contacts: 1 },
  ...over,
});
const contact = (id, name, phone) => ({ id, display_name: name, wa_profile_name: null, phone_e164: phone, consent: "opted_in", dnc: false });
const msg = (id, sender, body, at) => ({ id, conversation_id: "x", direction: sender === "customer" ? "inbound" : "outbound", sender, type: "text", body, media: null, meta: null, status: sender === "customer" ? "received" : "sent", created_at: at });
const conversations = [
  { id: "cv1", state: "needs_human", paused_until: null, last_wa_inbound_at: "2026-09-06T13:00:00Z", last_message_at: "2026-09-06T13:00:00Z", contact: contact("c1", "Daniela R.", "+17865550181"), messages: [msg("m1", "customer", "Can I move Saturday to 11? My sister is coming too", "2026-09-06T13:00:00Z")] },
  { id: "cv2", state: "needs_human", paused_until: null, last_wa_inbound_at: null, last_message_at: "2026-09-06T13:20:00Z", contact: contact("c2", "Ana", "+13055550134"), messages: [] },
  { id: "cv3", state: "open", paused_until: null, last_wa_inbound_at: "2026-09-05T19:30:00Z", last_message_at: "2026-09-05T19:30:00Z", contact: contact("c3", null, "+13475550100"), messages: [msg("m3", "customer", "hola, cuánto cuesta el balayage?", "2026-09-05T19:30:00Z")] },
];
const escalations = [
  { id: "e1", reason: "human_token", details: null, state: "open", created_at: "2026-09-06T12:00:00Z", conversation_id: "cv1" },
  { id: "e2", reason: "callback", details: "Call back to confirm Saturday 10:00.", state: "open", created_at: "2026-09-06T13:30:00Z", conversation_id: "cv2" },
];
const call = (id, over = {}) => ({
  id, retell_call_id: `r-${id}`, direction: "inbound", call_type: "phone_call", status: "ended", from_e164: "+13055550134", from_raw: null, to_e164: null,
  started_at: "2026-09-06T13:20:00Z", ended_at: "2026-09-06T13:21:35Z", duration_ms: 95_000, disconnection_reason: "user_hangup", sentiment: "Neutral", call_successful: true, in_voicemail: false,
  summary: "The user called to book a gel manicure.", transcript_object: null, recording: null, conversation_id: "cv2", contact_id: "c2", message_id: null,
  contact: { display_name: "Ana", wa_profile_name: null, phone_e164: "+13055550134" },
  wanted: "Asked for a gel manicure Saturday.", outcome: "callback_needed", follow_up: "Call back to confirm Saturday 10:00.", caller_name: "Ana", ...over,
});
const calls = [
  call("k1"),
  call("k2", { conversation_id: "cv9", contact_id: "c9", from_e164: "+13475550188", contact: { display_name: null, wa_profile_name: null, phone_e164: "+13475550188" }, started_at: "2026-09-06T12:40:00Z", ended_at: "2026-09-06T12:40:30Z", duration_ms: 30_000, in_voicemail: true, summary: null, wanted: null, outcome: "voicemail", follow_up: null, caller_name: null }),
];

test("one queue, longest wait first: the handoff, the call-back, the closing window, the call worth an ear — each in the strip's grammar with its own verb", () => {
  const vm = toTodayVM(metrics(), conversations, escalations, calls, NOW);
  const rows = vm.queue.rows;
  assert.deepEqual(rows.map((r) => r.kind), ["handoff", "callback", "window", "call"]);
  assert.equal(vm.queue.more, 0);

  const handoff = rows[0];
  assert.deepEqual([handoff.who, handoff.channel, handoff.when, handoff.quoted, handoff.warn], ["Daniela R.", "WhatsApp", "waited 2h", true, true]);
  assert.equal(handoff.sentence, "Can I move Saturday to 11? My sister is coming too");
  assert.deepEqual(handoff.status.slice(0, 2), ["Escalated", "asked for a person"]);
  assert.match(handoff.status[2], /^since 8:00 AM$/, "the salon's clock, whatever clock the reader holds");
  assert.deepEqual(handoff.cta, { label: "Open and reply", to: "inbox/th-cv1" });
  assert.deepEqual(handoff.also, { label: "Snooze", verb: "snooze", conversationId: "cv1", escalationId: "e1" });

  const callback = rows[1];
  assert.deepEqual([callback.who, callback.channel, callback.quoted, callback.tone], ["Ana", "Phone", false, "escalated"]);
  assert.equal(callback.sentence, "Call back to confirm Saturday 10:00.", "the to-do the phone receptionist left");
  assert.deepEqual(callback.status.slice(0, 1), ["Needs a call back"]);
  assert.deepEqual(callback.cta, { label: "Open the call", to: "conversations/cv-k1" }, "straight to the call, its summary and recording");
  assert.deepEqual(callback.also, { label: "Done", verb: "resolve", conversationId: "cv2", escalationId: "e2" });

  const window = rows[2];
  assert.deepEqual([window.who, window.channel, window.tone, window.quoted], ["+1 (347) 555-0100", "WhatsApp", "warn", true]);
  assert.match(window.when, /^closes 3:30 PM · in \dh$/);
  assert.deepEqual(window.cta, { label: "Open thread", to: "inbox/th-cv3" });
  assert.equal(window.also, null);

  const ear = rows[3];
  assert.deepEqual([ear.kind, ear.channel, ear.sentence, ear.cta.label, ear.cta.to], ["call", "Phone", "Reached voicemail", "Open the call", "conversations/cv-k2"]);
  assert.equal(ear.also, null);
});

test("the cap and the rest: six rows on Today, the rest counted for the Inbox link; a quiet day has an empty queue", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, reason: "human_token", details: null, state: "open", created_at: `2026-09-06T1${i}:00:00Z`.replace("T18", "T13").replace("T19", "T13"), conversation_id: "cv1" }));
  const vm = toTodayVM(metrics({ now: { ...metrics().now, escalations_open: 8 } }), conversations, many, [], NOW);
  assert.equal(vm.queue.rows.length, 6);
  assert.equal(vm.queue.more, 3, "eight handoffs and the closing window: six shown, three more");
  const quiet = toTodayVM(metrics({ period: { ...metrics().period, messages_in: 0, calls: 0, messages_out_you: 0 }, now: { ...metrics().now, escalations_open: 0 } }), [], [], [], NOW);
  assert.deepEqual(quiet.queue, { rows: [], more: 0 });
});

test("the wiring: one row component for People and Today, the queue in the command slot, the hero keeping only the narrative, the runs split between them", () => {
  const bits = readCode("apps/dashboard/src/legacy/pages/attention-bits.jsx");
  assert.ok(bits.includes("window.AttnRow = AttnRow;") && bits.includes('className="cl-attn-acts"'), "the grammar lives in one place");
  const manifest = readCode("apps/dashboard/src/legacy-bridge/manifest.ts");
  assert.ok(manifest.indexOf('"@/legacy/pages/attention-bits.jsx"') < manifest.indexOf('"@/legacy/pages/dashboard-a-brief.jsx"'), "loaded before the pages that draw it");
  const people = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");
  assert.ok(people.includes("<window.AttnRow") && !people.includes('className="cl-attn-status"'), "People's strip is an adapter over it");
  const queue = readCode("apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");
  for (const s of ['data-testid="today-queue"', "<TodayQueue vm={window.TODAY_DATA} />", "vm.queue.rows", 'testid="brief-run-row"', 'testid="brief-run-soon"', 'data-testid="brief-live-call"', "surface:live", "surface:broadcasts", 'verb(r, r.also.verb)']) assert.ok(queue.includes(s), s);
  const real = queue.slice(queue.indexOf("const LiveRail"), queue.indexOf("const AgentCommandSeed"));
  assert.ok(real.includes("Needs you") && !real.includes("Agent Command"), "the real section is Needs you, not a command bar; the seed keeps its title for the demo");
  const brief = readCode("apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
  for (const gone of ["needsYou.rows.slice(0, 2)", "earCalls.map", "liveCalls.map", "windowClosing.rows", "<RunsWaiting"]) assert.ok(!brief.includes(gone), `${gone} left the hero`);
  assert.ok(brief.includes("<RunsDone nav={nav} />") && brief.includes('data-testid="brief-run-done"'), "what went out today stays a receipt in the hero");
  const css = readRaw("apps/dashboard/src/legacy/styles/dashboard-a-v2.css");
  assert.ok(css.includes(".tq-live {") && css.includes(".tq-list .cl-attn-row:first-child { border-top: none; }"));
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/clients.css").includes(".cl-attn-acts { display: inline-flex; align-items: center; gap: 6px; }"));
});
