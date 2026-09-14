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

/* ------------- Today: a dark line silences the reassurance -------------- */

globalThis.EmptyState = globalThis.window.EmptyState;
globalThis.FailedRead = globalThis.window.FailedRead;
globalThis.PolicyChip = globalThis.window.PolicyChip;
globalThis.StatStrip = globalThis.window.StatStrip || (({ children }) => children);
globalThis.StatCell = globalThis.window.StatCell || ((p) => p.value);
globalThis.useHotkey = () => {};
Object.assign(globalThis.window, { canDo: () => true, appNavigate() {}, setInterval: () => 1, clearInterval() {}, dispatchEvent() {} });
await import("../../../apps/dashboard/src/legacy/pages/attention-bits.jsx");
await import("../../../apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
await import("../../../apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");

const todayWith = (channels) => toTodayVM({
  ...metrics(null),
  channels,
  now: { escalations_open: 0, oldest_open_escalation_at: null, threads_needing_human: 0, threads_snoozed: 0, threads_awaiting_reply: 0, last_inbound_at: null, last_outbound_at: null },
}, [], [], [], NOW);
const mountToday = (vm) => {
  globalThis.window.TODAY_DATA = vm;
  cells = []; seq = 0;
  const hero = textOf(globalThis.window.HeroBrief());
  cells = []; seq = 0;
  const queue = textOf(globalThis.window.AgentCommand());
  return { hero, queue };
};

test("REGRESSION: while a line is down, Today never says nothing needs you -- the hero and the queue say new messages go unanswered", () => {
  const down = todayWith([{ kind: "whatsapp", status: "disconnected", number: "+1 305" }]);
  assert.ok(down.standing.alert, "the fixture is a day with a dark line");
  const { hero, queue } = mountToday(down);
  assert.ok(!hero.includes("Queue clear"), hero);
  assert.ok(!queue.includes("All caught up"), queue);
  assert.ok(!queue.includes("nothing needs you"), `the queue's own heading does not reassure either: ${queue}`);
  assert.ok(hero.includes("Nothing waiting in the Inbox — new messages go unanswered until the line is back"), hero);
  assert.ok(queue.includes("Nothing in the queue — new messages go unanswered until the line is back."), queue);
});

test("with every line up and nothing waiting, the reassurance stands", () => {
  const { hero, queue } = mountToday(todayWith([{ kind: "whatsapp", status: "active", number: "+1 305" }]));
  assert.ok(hero.includes("Queue clear — nothing needs you"), hero);
  assert.ok(queue.includes("All caught up — the receptionist is answering on its own."), queue);
});

/* ---------------- the Inbox: Hold all, and a missing link ---------------- */

globalThis.window.CHANLY = { ...globalThis.window.CHANLY, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } };
await import("../../../apps/dashboard/src/legacy/pages/inbox.jsx");

test("REGRESSION: Hold all withdraws every real draft through the door the single Hold uses, stops every countdown at once, and names a draft the server would not hold", async () => {
  assert.equal(typeof globalThis.window.ixHoldAll, "function", "Hold all is one act that can be run");
  const state = {};
  const calls = [];
  const heldWhenAsked = [];
  const cancelSend = async (messageId) => {
    calls.push(messageId);
    heldWhenAsked.push(Object.values(state).every((s) => s.held));
    return messageId === "m2" ? { ok: false, message: "It has already gone out." } : { ok: true };
  };
  const drafts = [
    { id: "th-1", real: true, who: "Rosa", veto: { messageId: "m1" } },
    { id: "th-2", real: true, who: "Ana", veto: { messageId: "m2" } },
  ];
  const result = await globalThis.window.ixHoldAll(drafts, { state, cancelSend });
  assert.deepEqual(calls, ["m1", "m2"], "REGRESSION: the old Hold all never called the server, so every draft still sent");
  assert.ok(heldWhenAsked.length === 2 && heldWhenAsked.every(Boolean), "every countdown stopped before the first answer came back");
  assert.equal(state["th-1"].held, true);
  assert.equal(state["th-2"].held, false, "a draft the server could not hold is not shown as held");
  assert.equal(result.held, 1);
  assert.deepEqual(result.refused.map((r) => r.who), ["Ana"]);
});

test("REGRESSION: the shell passes a thread id on even when the Inbox has not loaded it, instead of dropping it", () => {
  assert.equal(typeof globalThis.window.ixRouteThread, "function", "the route's thread is one rule that can be run");
  const threads = [{ id: "th-a", who: "Emily Chen" }];
  assert.deepEqual(globalThis.window.ixRouteThread("th-missing", threads), { id: "th-missing", who: null });
  assert.deepEqual(globalThis.window.ixRouteThread("th-a", threads), { id: "th-a", who: "Emily Chen" });
  assert.deepEqual(globalThis.window.ixRouteThread(undefined, threads), { id: null, who: null });
});

test("REGRESSION: a link to a thread the Inbox has not loaded draws the missing notice in the pane and opens nobody else's conversation", () => {
  const opened = [];
  globalThis.InboxList = () => null;
  globalThis.InboxThread = (p) => { opened.push(p.thread ? p.thread.id : null); return null; };
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  globalThis.window.INBOX_DATA = {
    INBOX_BUCKETS: [], INBOX_VIEWS: [], CHANNEL_LABELS: {}, INBOX_BASELINE: {},
    THREADS: [{ id: "th-a", real: true, who: "Emily Chen", state: "escalated", needsYou: true, tags: [], whoMeta: "" }],
  };
  cells = []; seq = 0;
  const tree = globalThis.window.Inbox({ initialThreadId: "th-missing", showAgentRail: false });
  const missing = (() => { let hit = null; walk(tree, (n) => { if (!hit && n.props?.["data-testid"] === "inbox-missing-thread") hit = n; }); return hit; })();
  assert.ok(missing, "the pane says the conversation is not among those loaded");
  assert.ok(textOf(missing).includes("isn't among the newest"), textOf(missing));
  assert.deepEqual(opened.filter(Boolean), [], "REGRESSION: Emily Chen's thread opened in place of the one the link named");
});

/* ---------- the composer: no Save draft that keeps nothing ---------- */

await import("../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");

test("REGRESSION: a real thread's composer offers no Save draft -- it flashed 'Draft saved' and kept nothing", () => {
  assert.equal(typeof globalThis.window.InboxComposer, "function", "the composer can be drawn on its own");
  const buttons = (tree) => { const out = []; walk(tree, (n) => { if (n.type === "button") out.push(textOf(n)); }); return out; };
  cells = []; seq = 0;
  const real = globalThis.window.InboxComposer({ thread: { id: "th-1", real: true, who: "Rosa", primaryChannel: "whatsapp", hasChat: true, windowOpen: true, optedOut: false }, reply: "" });
  assert.ok(!buttons(real).some((b) => b.includes("Save draft")), JSON.stringify(buttons(real)));
  assert.ok(buttons(real).some((b) => b.includes("Send")), "the send stays");
  cells = []; seq = 0;
  const seed = globalThis.window.InboxComposer({ thread: { id: "t-seed", real: false, who: "Aisha", primaryChannel: "sms" }, reply: "" });
  assert.ok(buttons(seed).some((b) => b.includes("Save draft")), "the demo keeps its mockup control");
});
