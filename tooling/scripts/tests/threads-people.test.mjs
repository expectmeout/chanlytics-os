/**
 * Threads and people, honestly.
 *
 * Review findings F12, F16–F23: timelines ordered by import time, a call note
 * drawn as a WhatsApp bubble, "Latest from +1", "Answering" beside a person
 * set to Never, deep links that opened someone else's thread in silence, a
 * Needs-you rule that disagreed with the Inbox badge, a profile that counted
 * missed dials the list excluded, previews taken from cancelled drafts, and
 * an erasure that left the customer's number in old job payloads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toConversationVM, toInboxThreadVM, toCallVM, toPersonRowVM, toPersonVM, personStateFor } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const here = path.dirname(fileURLToPath(import.meta.url));
const { groupMessages } = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/dto.ts")).href);

const NOW = new Date("2026-09-04T15:00:00.000Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const H = 3_600_000;

test("a thread reads in channel time, whatever order the rows were written in", () => {
  // Newest-first rows, as the API returns them: an Aug 27 chat imported on
  // Aug 27, and an Aug 26 call note created when its analysis arrived later.
  const rows = [
    { id: "note", conversation_id: "c1", direction: "inbound", sender: "system", type: "call_summary", body: "Inbound call · 1 min — booked.", media: null, meta: {}, status: "received", created_at: "2026-08-27T15:00:00Z", channel_ts: "2026-08-26T23:38:00Z" },
    { id: "m2", conversation_id: "c1", direction: "outbound", sender: "ai", type: "text", body: "Hi!", media: null, meta: {}, status: "delivered", created_at: "2026-08-27T03:22:00Z", channel_ts: "2026-08-27T01:59:30Z" },
    { id: "m1", conversation_id: "c1", direction: "inbound", sender: "customer", type: "text", body: "how much is a haircut?", media: null, meta: {}, status: "received", created_at: "2026-08-27T03:22:00Z", channel_ts: "2026-08-27T01:59:00Z" },
  ];
  const grouped = groupMessages(rows).get("c1");
  assert.deepEqual(grouped.map((m) => m.id), ["note", "m1", "m2"], "REGRESSION: the Aug 26 call note rendered below the Aug 27 messages");
});

const conv = (messages, over = {}) => ({
  id: "c1", state: "open", paused_until: null, snooze_until: null, assignee_user_id: null,
  last_wa_inbound_at: ago(H), last_message_at: ago(H),
  contact: { id: "k1", display_name: null, wa_profile_name: null, phone_e164: "+19175746416", consent: null, dnc: false },
  messages, ...over,
});
const msg = (over) => ({ id: "m", direction: "inbound", sender: "customer", type: "text", body: "hola", media: null, meta: null, status: "received", created_at: ago(H), channel_ts: ago(H), ...over });

test("a call note knows it is one, and a person known by number keeps their whole number", () => {
  const vm = toConversationVM(conv([msg({ id: "m1" }), msg({ id: "n", direction: "inbound", sender: "system", type: "call_summary", body: "Inbound call · 1 min — booked." })]), ZONE, NOW);
  assert.deepEqual(vm.messages.map((m) => m.channel), ["whatsapp", "phone"], "the viewer drew the note as a WhatsApp bubble");
  assert.equal(vm.whoShort, "+1 (917) 574-6416", "REGRESSION: 'Latest from +1'");
  const named = toConversationVM(conv([msg({})], { contact: { id: "k1", display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175746416", consent: null, dnc: false } }), ZONE, NOW);
  assert.equal(named.whoShort, "Daniela");
  const call = toCallVM({
    id: "k1", retell_call_id: "r1", direction: "inbound", call_type: null, status: "ended", from_e164: "+19175746416", from_raw: null, to_e164: null,
    started_at: ago(H), ended_at: null, duration_ms: 1000, disconnection_reason: null, sentiment: null, call_successful: null, in_voicemail: null,
    summary: null, transcript_object: null, recording: null, conversation_id: null, contact_id: null, message_id: null,
    contact: { display_name: "+1 (917) 574-6416", wa_profile_name: null, phone_e164: "+19175746416" },
  }, ZONE, NOW);
  assert.equal(call.whoShort, "+1 (917) 574-6416");
});

test("a preview is the last thing that actually happened, never a cancelled or queued draft", () => {
  const messages = [
    msg({ id: "m1", body: "how much is a haircut?" }),
    msg({ id: "d1", direction: "outbound", sender: "ai", status: "canceled", body: "DRAFT that never left", created_at: ago(H / 2), channel_ts: null }),
  ];
  const vm = toConversationVM(conv(messages), ZONE, NOW);
  assert.equal(vm.outcome, "open", "REGRESSION: a cancelled draft made the thread read 'handled'");
  assert.match(vm.snippet, /how much is a haircut/);
  const inbox = toInboxThreadVM(conv(messages), null, ZONE, NOW);
  assert.doesNotMatch(inbox.preview, /DRAFT/);
});

/* -------------------------------- People ---------------------------------- */

const row = (over = {}) => ({
  id: "p1", display_name: "Dani", wa_profile_name: null, phone_e164: "+19175746416", consent: null, dnc: false, created_at: ago(30 * 24 * H),
  channels: ["whatsapp"], conversation_count: 1, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
  latest_conversation_id: "c1", latest_state: "open", latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null, latest_wa_inbound_at: ago(H),
  last_message_at: ago(H), last_message_direction: "inbound", last_message_sender: "customer", last_inbound_text: "hola", last_inbound_at: ago(H),
  last_call_at: null, call_count: 0, call_seconds: 0, first_contact_at: ago(30 * 24 * H), earliest_row_at: ago(30 * 24 * H), has_backfill: false, has_chat: true, queued_reply_at: null,
  ...over,
});

test("People says 'Held for you' for a person the receptionist was told to stay away from", () => {
  assert.equal(toPersonRowVM(row(), ZONE, NOW).receptionist.label, "Answering");
  assert.equal(toPersonRowVM(row({ effective_reply_mode: "never" }), ZONE, NOW).receptionist.label, "Held for you, set to Never", "REGRESSION: 'Answering' beside 'Receptionist for Dani: Never'");
  assert.equal(toPersonRowVM(row({ effective_reply_mode: "ask" }), ZONE, NOW).receptionist.label, "Held for you, set to Ask me first");
  assert.equal(toPersonRowVM(row({ effective_reply_mode: "veto" }), ZONE, NOW).receptionist.label, "Answering", "veto is the receptionist answering, on a delay");
});

test("Needs you follows the Inbox's rule: a thread someone took over, or snoozed, is not waiting on a person", () => {
  const nowMs = NOW.getTime();
  assert.equal(personStateFor(row({ open_escalation_reason: "human_token" }), nowMs), "needs_you");
  assert.equal(personStateFor(row({ needs_human: true }), nowMs), "needs_you");
  assert.equal(personStateFor(row({ needs_human: true, latest_assignee_user_id: "u1" }), nowMs), "waiting_on_you", "REGRESSION: a taken-over thread still counted under Needs you");
  assert.equal(personStateFor(row({ open_escalation_reason: "human_token", latest_state: "snoozed", latest_snooze_until: ago(-H) }), nowMs), "active");
  assert.equal(toPersonRowVM(row({ open_escalation_reason: "human_token", latest_assignee_user_id: "u1" }), ZONE, NOW).receptionist.label, "Paused, a person owns the thread");
});

test("the profile does not count a dial that never connected, and names it", () => {
  const call = (id, over = {}) => ({
    id, retell_call_id: `r-${id}`, direction: "inbound", call_type: null, status: "ended", from_e164: "+19175746416", from_raw: null, to_e164: null,
    started_at: ago(2 * H), ended_at: ago(2 * H), duration_ms: 60_000, disconnection_reason: null, sentiment: null, call_successful: null, in_voicemail: null,
    summary: "Booked.", transcript_object: null, recording: null, conversation_id: "c1", contact_id: "p1", message_id: null, contact: null, ...over,
  });
  const detail = {
    row: row({ call_count: 1, call_seconds: 60 }), identities: [], conversations: [], escalations: [], decisions: [],
    calls: [call("a"), call("b", { status: "not_connected", duration_ms: null, summary: null, started_at: ago(H) })],
    receptionist_mode: null, workspace_reply_mode: "auto",
  };
  const vm = toPersonVM(detail, ZONE, NOW);
  const calls = vm.facts.find((f) => f.label === "Calls");
  assert.equal(calls.value, 1, "REGRESSION: the list said 1 call, the profile said 2");
  const missed = vm.timeline.find((t) => t.who === "Missed call");
  assert.ok(missed, "the timeline still shows the attempt");
  assert.equal(missed.text, "The call never connected.");
});

test("the profile's Right now agrees with the mode two inches away", () => {
  const detail = { row: row(), identities: [], conversations: [], escalations: [], decisions: [], calls: [], receptionist_mode: "never", workspace_reply_mode: "auto" };
  const vm = toPersonVM(detail, ZONE, NOW);
  assert.equal(vm.rightNow.title, "Held for you, set to Never");
  assert.match(vm.rightNow.detail, /come straight to you/);
  const ws = toPersonVM({ ...detail, receptionist_mode: null, workspace_reply_mode: "ask" }, ZONE, NOW);
  assert.equal(ws.rightNow.title, "Held for you, set to Ask me first");
  assert.match(ws.rightNow.detail, /for the workspace/);
});

test("the API attaches the mode in force, and an erasure scrubs the jobs that carried the number", () => {
  // The reading moved into one helper the list route and the CSV export share.
  const list = readCode("apps/dashboard/src/server/people.ts");
  assert.ok(list.includes("effective_reply_mode: personMode.get(r.id) ?? workspaceMode"));
  const detail = readCode("apps/dashboard/app/api/v1/contacts/[id]/route.ts");
  assert.ok(detail.includes("effective_reply_mode: personPol.data?.mode ?? wsPol.data?.mode ?? null"));
  assert.ok(detail.includes("scrubErasedJobs(contact.tenant_id, id, threadIds)"));
  const service = readCode("apps/dashboard/src/server/service.ts");
  assert.ok(service.includes('.neq("kind", "blob_thread_erase")'), "the job doing the erasing is left alone");
  assert.ok(service.includes('reason: "contact erased"'));
});

test("a deep link to a thread that is not in view says so instead of opening someone else's", () => {
  const cv = readRaw("apps/dashboard/src/legacy/pages/conversations.jsx");
  assert.ok(cv.includes("const requestedMissing = !!initialId"));
  assert.ok(cv.includes("open the person in People to find it"));
  assert.ok(!cv.includes('String(c.who || "").split(" ")[0]'), "REGRESSION: 'Latest from +1'");
  assert.ok(cv.includes('m.channel === "phone" ? "Phone · call note"'));
  const ix = readRaw("apps/dashboard/src/legacy/pages/inbox.jsx");
  assert.ok(ix.includes("const requestedMissing = !!initialThreadId"));
  const pane = readRaw("apps/dashboard/src/legacy/pages/inbox-thread.jsx");
  assert.ok(pane.includes('{notice && <div className="ix-notice" role="status">{notice}</div>}'));
});
