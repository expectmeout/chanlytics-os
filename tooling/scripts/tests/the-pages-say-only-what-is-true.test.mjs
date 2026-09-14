/**
 * The pages say only what is true.
 *
 * Walking the live app on 14 September 2026 turned up sentences the data
 * underneath contradicts, on a real workspace, in front of its owner:
 *
 * - Today said "The oldest has been waiting since 6:51 PM" of a customer who
 *   had been waiting eight days, because the time was printed without its date.
 * - Conversations pilled a call "Receptionist handled it" directly above its own
 *   "Needs a call back" and "To do: Call Emily back" -- the pill only knew
 *   live, missed and everything else.
 * - The same call's notes said "Noted on Emily's WhatsApp thread" of a caller
 *   who has no WhatsApp thread at all.
 *
 * Each is pinned here as behaviour, run against the contracts that decide it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM, toCallVM, stateOf } from "@chanlytics/contracts";

// 10:00 in New York on Sunday 6 September 2026.
const NOW = new Date("2026-09-06T14:00:00Z");

const metrics = (oldest) => ({
  workspace: { name: "Melany's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }, { kind: "voice", status: "active", number: "+1 786" }],
  window: { days: 1, since: "2026-09-06T04:00:00Z", since_local: "2026-09-06T00:00:00", now_local: "2026-09-06T10:00:00" },
  now: { escalations_open: 2, oldest_open_escalation_at: oldest, threads_needing_human: 2, threads_snoozed: 0, threads_awaiting_reply: 0, last_inbound_at: "2026-09-06T13:00:00Z", last_outbound_at: "2026-09-06T13:01:00Z" },
  period: { messages_in: 5, messages_out_ai: 4, messages_out_you: 0, conversations_active: 3, answered_by_ai: 4, answered_by_you: 0, unanswered_in_window: 1, median_reply_seconds_ai: 40, send_failures: 0, escalations_new: 2, escalation_reasons: {}, calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0, new_contacts: 0 },
});
const contact = (id, name) => ({ id, display_name: name, wa_profile_name: null, phone_e164: "+17865550181", consent: "opted_in", dnc: false });
const conversation = (id, name) => ({
  id, state: "needs_human", paused_until: null, last_wa_inbound_at: null, last_message_at: "2026-08-29T12:00:00Z",
  contact: contact(`c-${id}`, name),
  messages: [{ id: `m-${id}`, conversation_id: id, direction: "inbound", sender: "customer", type: "text", body: "Can I move Saturday?", media: null, meta: null, status: "received", created_at: "2026-08-29T12:00:00Z" }],
});
const escalation = (id, conversationId, createdAt) => ({ id, reason: "human_token", details: null, state: "open", created_at: createdAt, conversation_id: conversationId });

/* ---------------------- a wait is said with its day --------------------- */

test("a wait from an earlier day says which day: yesterday, the weekday inside a week, the date beyond it -- and today stays a bare time", () => {
  const cases = [
    ["2026-09-06T12:00:00Z", "since 8:00 AM"],
    ["2026-09-05T12:00:00Z", "since yesterday 8:00 AM"],
    ["2026-09-04T12:00:00Z", "since Fri 8:00 AM"],
    ["2026-08-31T12:00:00Z", "since Mon 8:00 AM"],
    ["2026-08-29T12:00:00Z", "since Aug 29, 8:00 AM"],
  ];
  for (const [createdAt, words] of cases) {
    const vm = toTodayVM(metrics(createdAt), [conversation("cv1", "Zoe Martin")], [escalation("e1", "cv1", createdAt)], [], NOW);
    const row = vm.queue.rows.find((r) => r.kind === "handoff");
    assert.ok(row, `a handoff row for ${createdAt}`);
    assert.ok(row.status.includes(words), `${createdAt}: expected "${words}" in ${JSON.stringify(row.status)}`);
  }
});

test("the headline's oldest wait carries its day too: eight days is not 'since 6:51 PM'", () => {
  const vm = toTodayVM(
    metrics("2026-08-29T22:51:00Z"),
    [conversation("cv1", "Zoe Martin"), conversation("cv2", "Daniela Reyes")],
    [escalation("e1", "cv1", "2026-08-29T22:51:00Z"), escalation("e2", "cv2", "2026-08-29T22:57:00Z")],
    [],
    NOW,
  );
  assert.equal(vm.standing.detail, "The oldest has been waiting since Aug 29, 6:51 PM.");
});

/* --------------------- a call's pill tells its story -------------------- */

const call = (over = {}) => ({
  id: "k7", retell_call_id: "r-k7", direction: "inbound", call_type: "phone_call", status: "ended",
  from_e164: "+19175550106", from_raw: null, to_e164: "+13083368109",
  started_at: "2026-09-06T13:00:00Z", ended_at: "2026-09-06T13:03:10Z", duration_ms: 190_000,
  disconnection_reason: "agent_hangup", sentiment: "Positive", call_successful: true, in_voicemail: false,
  summary: "The user called Melany's Beauty Salon to arrange a bridal trial.", transcript_object: null, recording: null,
  conversation_id: "cv7", contact_id: "c7", message_id: "m7",
  contact: { display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106" },
  wanted: "Wants to book a bridal trial on October 3", outcome: "callback_needed",
  follow_up: "Call Emily back to confirm the bridal trial", caller_name: "Emily",
  ...over,
});

test("a call that asked for a call back is never pilled 'handled', and the words stay true after someone calls back", () => {
  const vm = toCallVM(call(), NOW);
  assert.equal(vm.outcome, "callback");
  assert.deepEqual(stateOf("call", "callback"), { tone: "warn", label: "Asked for a call back" });
});

test("the caller who hung up in seconds is pilled as that, the same rule Today already uses", () => {
  const vm = toCallVM(call({ duration_ms: 6_000, disconnection_reason: "user_hangup", outcome: null, follow_up: null }), NOW);
  assert.equal(vm.outcome, "abandoned");
  assert.equal(stateOf("call", "abandoned").label, "Hung up early");
});

test("a call that neither asked for anything nor ended early is still handled", () => {
  assert.equal(toCallVM(call({ outcome: null, follow_up: null }), NOW).outcome, "handled");
  assert.equal(toCallVM(call({ status: "not_connected", duration_ms: 0, outcome: null }), NOW).outcome, "missed", "a dial that never connected keeps its own word");
});

test("a call's note names the thread it went to, never a channel the caller may not have", () => {
  const bullets = toCallVM(call(), NOW).summary.bullets;
  assert.ok(bullets.includes("Noted on Emily's thread in the Inbox"), JSON.stringify(bullets));
  assert.ok(!bullets.some((b) => b.includes("WhatsApp thread")), "a phone-only caller has no WhatsApp thread");
});

/* ------------------- the Conversations pill, mounted -------------------- */

let cells = [];
let seq = 0;
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useReducer: (red, init) => { const k = seq++; if (!(k in cells)) cells[k] = init; return [cells[k], (a) => { cells[k] = red(cells[k], a); }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => { const k = seq++; if (!(k in cells)) cells[k] = fn(); return cells[k]; },
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = { body: {}, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }) };
globalThis.window = {
  __chrome: { state: stateOf },
  CHANLY: { nav() {}, R: {} },
  gate: () => ({}),
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  setTimeout: () => 1,
  clearTimeout() {},
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.StatePill = globalThis.window.StatePill;
await import("../../../apps/dashboard/src/legacy/pages/conversations.jsx");
const { OutcomePill } = globalThis.window;

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const textOf = (n) => { const out = []; walk(n, (x) => { for (const k of x.props?.children ?? []) if (typeof k === "string" || typeof k === "number") out.push(String(k)); }); return out.join(""); };
const pillClass = (n) => (n.rendered ?? n).props.className;

test("Conversations draws a call's own story in amber -- 'Asked for a call back', 'Hung up early' -- and keeps 'Receptionist handled it' for the calls it describes", () => {
  const callback = OutcomePill({ outcome: toCallVM(call(), NOW).outcome, channel: "phone" });
  assert.equal(textOf(callback), "Asked for a call back");
  assert.ok(pillClass(callback).includes("pill-warn"), pillClass(callback));

  const quick = OutcomePill({ outcome: toCallVM(call({ duration_ms: 6_000, disconnection_reason: "user_hangup", outcome: null, follow_up: null }), NOW).outcome, channel: "phone" });
  assert.equal(textOf(quick), "Hung up early");
  assert.ok(pillClass(quick).includes("pill-warn"), pillClass(quick));

  const handled = OutcomePill({ outcome: toCallVM(call({ outcome: null, follow_up: null }), NOW).outcome, channel: "phone" });
  assert.equal(textOf(handled), "Receptionist handled it");
});
