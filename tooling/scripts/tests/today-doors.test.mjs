/**
 * Today: doors that open the record, and a day that says only what is true.
 *
 * - "See the thread" beside a reply that failed to deliver opened the Inbox list, not the thread; "Open Live"
 *   beside a call in progress opened Live's list, where the oldest call leads (the wiring audit's A21).
 * - Approving a waiting run said "sending now" when the server had moved it to nine o'clock.
 * - The view model kept the day's three receipts, the quiet day's proof and its way to earlier conversations;
 *   the hero drew one receipt and neither of the others.
 * - With no line connected the queue said the receptionist was "answering on its own" and the hero said the
 *   queue was clear, beside the line pointing at Setup.
 * Run against the contracts and the pages on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM, toLiveVM } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-06T14:00:00Z");

// The metrics read as the-pages-say-only-what-is-true.test.mjs copies it.
const zeroNow = { escalations_open: 0, oldest_open_escalation_at: null, threads_needing_human: 0, threads_snoozed: 0, threads_awaiting_reply: 0, last_inbound_at: null, last_outbound_at: null };
const busyPeriod = { messages_in: 5, messages_out_ai: 4, messages_out_you: 0, conversations_active: 3, answered_by_ai: 4, answered_by_you: 0, unanswered_in_window: 0, median_reply_seconds_ai: 40, send_failures: 0, escalations_new: 0, escalation_reasons: {}, calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0, new_contacts: 0 };
const quietPeriod = { ...busyPeriod, messages_in: 0, messages_out_ai: 0, conversations_active: 0, answered_by_ai: 0, median_reply_seconds_ai: null };
const metrics = (over = {}) => ({
  workspace: { name: "Melany's Beauty Salon", timezone: ZONE, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }, { kind: "voice", status: "active", number: "+1 786" }],
  window: { days: 1, since: "2026-09-06T04:00:00Z", since_local: "2026-09-06T00:00:00", now_local: "2026-09-06T10:00:00" },
  now: { ...zeroNow, last_inbound_at: "2026-09-06T13:00:00Z", last_outbound_at: "2026-09-06T13:01:00Z" },
  period: busyPeriod,
  ...over,
});
const contact = (id, name) => ({ id, display_name: name, wa_profile_name: null, phone_e164: "+17865550181", consent: "opted_in", dnc: false });
const msg = (over = {}) => ({ id: "m", conversation_id: "cv1", direction: "inbound", sender: "customer", type: "text", body: "Can I move Saturday?", media: null, meta: null, status: "received", created_at: "2026-09-06T12:00:00Z", ...over });
const conversation = (id, name, messages) => ({
  id, state: "open", paused_until: null, assignee_user_id: null, assignee_is_me: false,
  last_wa_inbound_at: "2026-09-06T12:00:00Z", last_message_at: "2026-09-06T12:01:00Z",
  contact: contact(`c-${id}`, name), messages,
});
// A call on the line now, as the calls route returns it (live-page-controls.test.mjs), against the real clock.
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const liveCall = () => ({
  id: "c-live", retell_call_id: "call_abc123def456", direction: "inbound", call_type: "phone_call", status: "ongoing",
  from_e164: "+16465550123", from_raw: null, to_e164: "+13055550100",
  started_at: ago(90_000), ended_at: null, duration_ms: null, disconnection_reason: null,
  sentiment: null, call_successful: null, in_voicemail: null, summary: null, wanted: null, outcome: null, follow_up: null, caller_name: null,
  transcript_object: [{ role: "user", content: "Hi, is Melany in?" }],
  recording: null, conversation_id: "cv1", contact_id: "k1", message_id: null,
  created_at: ago(90_000), updated_at: ago(2_000),
  contact: { display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123" },
});

/* -------------------------------- the pages, drawn -------------------------------- */

let cells = [];
let seq = 0;
const went = [];
const flashes = [];
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
  useMemo: (fn) => fn(),
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = { body: {}, addEventListener() {}, removeEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }) };
globalThis.window = {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  __clock: { dayKey: () => "2026-09-06", time: () => "9:00 AM" },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatePill", "EmptyState", "FailedRead", "PolicyChip", "StatStrip", "StatCell"]) globalThis[k] = globalThis.window[k] || (({ children }) => children ?? null);
globalThis.useHotkey = () => {};
globalThis.window.usePPToast = () => [null, (m) => flashes.push(m)];
await import("../../../apps/dashboard/src/legacy/pages/attention-bits.jsx");
await import("../../../apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
await import("../../../apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");
const { TODAY_HELPERS } = await import("../../../apps/dashboard/src/legacy-bridge/today.ts");
globalThis.window.__today = TODAY_HELPERS;

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => { let hit; walk(tree, (n) => { if (hit === undefined && pred(n)) hit = n; }); return hit; };
const findAll = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const buttonsSaying = (tree, words) => findAll(tree, (n) => n.type === "button" && textOf(n).includes(words));
const mountHero = (vm) => { globalThis.window.TODAY_DATA = vm; cells = []; seq = 0; return globalThis.window.HeroBrief(); };
// The day's lines (its receipts, the proof, a reply that failed) sit in the day's card under the work (TodayCard).
const mountCard = (vm) => { globalThis.window.TODAY_DATA = vm; cells = []; seq = 0; return globalThis.window.TodayCard(); };
const mountQueue = (vm) => { globalThis.window.TODAY_DATA = vm; cells = []; seq = 0; return globalThis.window.AgentCommand(); };
const todayWith = (channels, over = {}) => toTodayVM(metrics({ channels, now: zeroNow, period: quietPeriod, ...over }), [], [], [], NOW);

test("REGRESSION (A21): a reply that failed to deliver opens its thread -- 'See the thread' opened the Inbox list", () => {
  const failed = conversation("cv9", "Rosa Díaz", [
    msg({ id: "m1", conversation_id: "cv9" }),
    msg({ id: "m2", conversation_id: "cv9", direction: "outbound", sender: "ai", body: "Yes, Saturday at 3 works.", status: "failed", created_at: "2026-09-06T12:01:00Z" }),
  ]);
  const vm = toTodayVM(metrics({ period: { ...busyPeriod, send_failures: 1 } }), [failed], [], [], NOW);
  const warn = vm.recap.sentences.find((s) => s.warn);
  assert.equal(warn.to, "inbox/th-cv9", "REGRESSION: the failed send's sentence carried no thread");
  buttonsSaying(mountCard(vm), "See the thread")[0].props.onClick();
  assert.equal(went.at(-1), "inbox/th-cv9");
});

test("REGRESSION: Today's first screen is the work -- above it stood a greeting, a headline the queue says again, four sentences, a chip repeating its count, an arc and six stat cards, and on a phone the first thing needing a person started 679px down", () => {
  const vm = toTodayVM(metrics(), [conversation("cv1", "Rosa Díaz", [msg({})])], [], [], NOW);
  const standing = mountHero(vm);
  const said = textOf(standing);
  assert.match(said, /lines connected/, "the standing line says the day, the time and whether the lines are up");
  assert.ok(!/Good (morning|afternoon|evening)/.test(said), "REGRESSION: a greeting above the work");
  assert.ok(!/need you/.test(said), "REGRESSION: a chip saying the queue's own count, over the queue");
  assert.equal(find(standing, (n) => typeof n.type === "function" && n.type.name === "PulseArc"), undefined, "REGRESSION: an arc saying the answered ratio a third time");
  assert.equal(findAll(standing, (n) => typeof n.type === "function" && n.type.name === "StatCell").length, 0, "REGRESSION: six stat cards over the work");

  // Under the work: the day's figures, and only the lines they do not carry.
  const card = mountCard(vm);
  assert.ok(find(card, (n) => n.props?.["data-testid"] === "today-figure-messages"), "the day's figures");
  const beats = findAll(card, (n) => typeof n.props?.className === "string" && n.props.className.includes("brief-beat-text")).map(textOf);
  assert.ok(!beats.some((b) => /receptionist answered|reached the phone line|messages? in/.test(b)), `REGRESSION: the figures say these already: ${beats.join(" | ")}`);
});

test("REGRESSION (A21): Open Live beside a call in progress opens that call -- it opened Live's list, where the oldest call leads", () => {
  globalThis.window.__LIVE = toLiveVM([liveCall()], [], ZONE, new Date());
  try {
    buttonsSaying(mountQueue(toTodayVM(metrics(), [], [], [], NOW)), "Open Live")[0].props.onClick();
    assert.equal(went.at(-1), "live/c-live");
  } finally {
    delete globalThis.window.__LIVE;
  }
});

test("REGRESSION: approving a waiting run the server moved to nine says so on Today -- the toast said 'sending now'", async () => {
  globalThis.window.__BROADCASTS = { rows: [{ id: "b-w", state: "pending_approval", playbook_id: "pb-1", name: "Win-back", audience: { label: "Win-back" }, recipient_count: 3, scheduled_for: null, started_at: null, counts: { sent: 0, replied: 0 } }] };
  globalThis.window.__broadcasts = { approve: async () => ({ ok: true, data: { recipient_count: 3, scheduled_for: "2026-09-15T13:00:00Z", moved_from: "2026-09-15T02:00:00Z" } }) };
  // The one sentence for when a send really goes (broadcasts-real.jsx, run in the-pages-say-only-what-is-true.test.mjs).
  globalThis.window.bcWhenWords = (d) => (d && d.moved_from ? "scheduled for Mon 9:00 AM — messages go out between 9:00 and 20:59 by your clock" : "sending now");
  try {
    const tree = mountQueue(toTodayVM(metrics(), [], [], [], NOW));
    const row = find(tree, (n) => n.props?.["data-testid"] === "brief-run-row");
    await buttonsSaying(row, "Approve")[0].props.onClick();
    const said = textOf(flashes.at(-1).msg);
    assert.ok(!said.includes("sending now"), `REGRESSION: ${said}`);
    assert.ok(said.includes("scheduled for Mon 9:00 AM"), said);
  } finally {
    delete globalThis.window.__BROADCASTS;
    delete globalThis.window.__broadcasts;
    delete globalThis.window.bcWhenWords;
  }
});

test("the day's receipts are all drawn -- the view model kept three and the hero showed one", () => {
  const names = ["Rosa Díaz", "Nina Park", "Ada Lovelace"];
  const convs = names.map((name, i) => conversation(`cv${i}`, name, [
    msg({ id: `in${i}`, conversation_id: `cv${i}`, created_at: `2026-09-06T1${i}:00:00Z` }),
    msg({ id: `out${i}`, conversation_id: `cv${i}`, direction: "outbound", sender: "ai", body: `See you at ${i + 2}pm.`, status: "sent", created_at: `2026-09-06T1${i}:01:00Z` }),
  ]));
  const vm = toTodayVM(metrics(), convs, [], [], NOW);
  assert.equal(vm.recap.receipts.length, 3, "the fixture is a day with three replies");
  const receipts = findAll(mountCard(vm), (n) => n.props?.["data-testid"] === "brief-receipt");
  assert.equal(receipts.length, 3, "REGRESSION: two of the three receipts were never drawn");
  buttonsSaying(receipts[2], "Open")[0].props.onClick();
  assert.equal(went.at(-1), vm.recap.receipts[2].to);
});

test("a quiet day shows its proof -- which lines are on -- and the way to the conversations before it", () => {
  const yesterday = conversation("cv1", "Rosa Díaz", [msg({ created_at: "2026-09-05T12:00:00Z" })]);
  const vm = toTodayVM(metrics({ now: zeroNow, period: quietPeriod }), [yesterday], [], [], NOW);
  assert.ok(vm.quiet && vm.quiet.launchpad, "the fixture is a quiet day with an earlier conversation");
  const hero = mountCard(vm);
  const proof = find(hero, (n) => n.props?.["data-testid"] === "brief-quiet-proof");
  assert.ok(proof, "REGRESSION: the quiet day's proof was never drawn");
  assert.match(textOf(proof), /WhatsApp/);
  assert.match(textOf(proof), /· on/);
  const door = buttonsSaying(hero, "earlier conversation")[0];
  assert.ok(door, "REGRESSION: the quiet day's way to earlier conversations was never drawn");
  door.props.onClick();
  assert.equal(went.at(-1), "conversations");
});

test("REGRESSION: with no line connected, Today does not say the receptionist is answering -- one sentence, and one door to Setup", () => {
  globalThis.window.__SETUP = { vm: { line: "3 things left to set up before customers can reach you", readiness: { answering: false } } };
  try {
    const vm = todayWith([]);
    const hero = mountHero(vm);
    const recap = mountCard(vm);
    const queue = mountQueue(vm);
    const said = textOf(hero) + textOf(recap) + textOf(queue);
    assert.ok(!said.includes("answering on its own"), "REGRESSION: the queue said the receptionist was answering, with no line to answer on");
    assert.ok(!said.includes("Queue clear — nothing needs you"), "nor that the queue was clear, as if all were well");
    assert.equal(buttonsSaying(hero, "Open Setup").length + buttonsSaying(recap, "Open Setup").length + buttonsSaying(queue, "Open Setup").length, 1, "one door to Setup");
  } finally {
    delete globalThis.window.__SETUP;
  }
});

test("REGRESSION: an email-only workspace is not told nothing can come in, nor that the receptionist is answering", () => {
  globalThis.window.__SETUP = { vm: { line: null, readiness: { answering: false } } };
  try {
    const vm = todayWith([{ kind: "email", status: "active", number: null, address: "bestmovers@mail.chanlytics.com" }]);
    const said = textOf(mountHero(vm)) + textOf(mountQueue(vm));
    assert.match(said, /1 of 1 line connected/, "REGRESSION: the page counted the routing rows, and email is not one");
    assert.ok(!said.includes("nothing can come in"), "email comes in");
    assert.ok(!said.includes("answering on its own"), "the receptionist does not answer email");
    assert.ok(!said.includes("nothing needs you"), `the heading does not reassure over a line nobody answers: ${said}`);
    assert.match(said, /every email waits for you in the Inbox/);
  } finally { delete globalThis.window.__SETUP; }
});
