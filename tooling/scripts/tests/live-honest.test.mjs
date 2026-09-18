/**
 * Live says what is true about a call, and a keyboard can reach it.
 *
 * - An ended call's card led with the phone provider's own summary, though the analysis says what the
 *   caller wanted, how it ended and what to do next; every caller's row drew a "P" (the wiring audit's A20).
 * - The header said "no phone line yet" when the line could not be read (A16).
 * - The hand-over's toast read r.line, which the client nests under data, so it named the line from
 *   Settings rather than the one the server rang; before Settings had been read, the button said to add a
 *   line the workspace may well have (A20).
 * - "Sep 6 · 3:10" put a call's length where a time reads, and the door said "Open client" (L8).
 * - Rows took a click and nothing else (the Live half of A25); a link could not name a call; and a call
 *   gone quiet said nothing until the checking banner, minutes later.
 * Run against the contracts and the page on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toLiveVM, toLiveCallVM, liveStillUp, liveBar, fmtClock } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const LINE = "+13055550199";
const RANG = "+13055550142";

// A call as the calls route returns it (live-page-controls.test.mjs).
const call = (over = {}) => ({
  id: "c-live", retell_call_id: "call_abc123def456", direction: "inbound", call_type: "phone_call", status: "ongoing",
  from_e164: "+16465550123", from_raw: null, to_e164: "+13055550100",
  started_at: iso(90_000), ended_at: null, duration_ms: null, disconnection_reason: null,
  sentiment: null, call_successful: null, in_voicemail: null, summary: null, wanted: null, outcome: null, follow_up: null, caller_name: null,
  transcript_object: [
    { role: "agent", content: "Thank you for calling Melany's Beauty Salon!" },
    { role: "user", content: "Hi, is Melany in today?" },
  ],
  recording: null, conversation_id: "cv1", contact_id: "k1", message_id: null,
  created_at: iso(90_000), updated_at: iso(2_000),
  contact: { display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123" },
  ...over,
});
// Ended, with the post-call analysis (the-pages-say-only-what-is-true.test.mjs's words).
const ended = (over = {}) => call({
  id: "c-done", status: "ended", started_at: iso(3_600_000), ended_at: iso(3_410_000), duration_ms: 190_000,
  disconnection_reason: "user_hangup", created_at: iso(3_600_000), updated_at: iso(3_400_000),
  from_e164: "+19175550106", contact_id: "c7", conversation_id: "cv7",
  contact: { display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106" },
  summary: "The user called Melany's Beauty Salon to arrange a bridal trial.",
  wanted: "Wants to book a bridal trial on October 3", outcome: "callback_needed",
  follow_up: "Call Emily back to confirm the bridal trial", caller_name: "Emily",
  ...over,
});
const channels = [{ id: "ch1", kind: "voice", number_e164: "+13055550100", status: "active", created_at: iso(86_400_000), config: {} }];

/* -------------------------------- the view model -------------------------------- */

test("REGRESSION (A20, L8): an ended call carries what the caller wanted, how it ended, what to do next, and its length in words", () => {
  const vm = toLiveCallVM(ended(), ZONE, new Date(NOW));
  assert.equal(vm.wanted, "Wants to book a bridal trial on October 3", "REGRESSION: the Live card had only the provider's summary");
  assert.equal(typeof vm.outcomeWords, "string");
  assert.ok(vm.outcomeWords.length > 0, "how it ended, in the owner's words");
  assert.equal(vm.followUp, "Call Emily back to confirm the bridal trial");
  assert.equal(vm.callerName, "Emily");
  assert.equal(vm.lengthWords, "3 min 10 sec");
  const live = toLiveCallVM(call(), ZONE, new Date(NOW));
  assert.deepEqual([live.wanted, live.followUp, live.lengthWords], [null, null, null], "a call in progress has none of these yet");
});

/* ------------------------------ the page, drawn ------------------------------ */

let cells = [];
let seq = 0;
const flashes = [];
const went = [];
globalThis.Icon = "Icon";
globalThis.StatePill = "StatePill";
globalThis.StatStrip = "StatStrip";
globalThis.StatCell = "StatCell";
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
};
globalThis.window = {
  __LIVE: toLiveVM([call()], channels, ZONE, new Date(NOW)),
  // The chrome bridge, as installShell publishes it: the heartbeat rule the page
  // re-applies between refreshes is contracts', not a fourth copy of it.
  __chrome: { liveStillUp, liveBar, fmtClock },
  __FACTS: { facts: { handoff_number: { value: LINE } } },
  // The client's answer: the route's body under data (client/api.ts), never flat.
  __handOverCall: async () => ({ ok: true, data: { ok: true, decision_id: "d2", line: RANG } }),
  __endCall: async () => ({ ok: true, data: { ok: true, decision_id: "d1" } }),
  __whisperCall: async () => ({ ok: true, data: {} }),
  __refreshLive: () => {},
  usePPToast: () => [null, (m) => flashes.push(m)],
  gate: () => ({}),
  CHANLY: { nav: (to) => went.push(to), R: { client: (id) => `clients/${id}` } },
  setInterval: () => 1,
  clearInterval: () => {},
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document ??= { body: {}, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }) };
globalThis.ReactDOM ??= { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["Confirm", "EmptyState", "FailedRead"]) globalThis[k] = globalThis.window[k];
globalThis.window.usePPToast = () => [null, (m) => flashes.push(m)];
await import("../../../apps/dashboard/src/legacy/pages/live-monitor-real.jsx");
const Page = globalThis.window.LiveMonitorPage;

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => { let hit; walk(tree, (n) => { if (hit === undefined && pred(n)) hit = n; }); return hit; };
const findAll = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const withLive = (calls, ch = channels) => { globalThis.window.__LIVE = toLiveVM(calls, ch, ZONE, new Date(NOW)); cells = []; };
const mount = (props = {}) => { seq = 0; return Page(props); };
const callRows = (tree) => findAll(tree, (n) => n.type === "tr" && n.props?.["data-call-id"]);

test("REGRESSION (A20, L8): an ended call's card leads with what the caller wanted, says what to do next, and gives its length in words beside the time", () => {
  withLive([ended()]);
  const tree = mount();
  const vm = globalThis.window.__LIVE.recent[0];
  const card = byTestId(tree, "live-summary");
  assert.match(textOf(card), /Wants to book a bridal trial on October 3/, "REGRESSION: the card led with the provider's summary");
  assert.ok(textOf(card).includes(vm.outcomeWords), "how it ended");
  assert.match(textOf(card), /To do: Call Emily back to confirm the bridal trial/);
  const meta = textOf(find(tree, (n) => n.props?.className === "lm-head-meta"));
  assert.match(meta, / · 3 min 10 sec/);
  assert.doesNotMatch(meta, /· 3:10/, "REGRESSION: 'Sep 6 · 3:10' put a length where a time reads");
  assert.ok(find(tree, (n) => n.type === "button" && textOf(n).includes("Open profile")), "the door names what it opens");
  assert.ok(!textOf(tree).includes("Open client"));
});

test("REGRESSION (A20, A25): a caller's row shows their initials, and the rows take the keyboard -- Tab reaches them, Enter opens one, arrows move", () => {
  withLive([call(), ended()]);
  let tree = mount();
  let rows = callRows(tree);
  assert.equal(rows.length, 2, "REGRESSION: rows carried no call id a keyboard could move between");
  assert.match(textOf(rows[0]), /RD/, "REGRESSION: every caller was drawn as 'P'");
  assert.deepEqual(rows.map((r) => r.props.tabIndex), [0, 0], "Tab reaches every row");
  assert.deepEqual(rows.map((r) => r.props["aria-current"]), ["true", undefined], "the open call is the current row");
  const focused = [];
  const list = { querySelector: (sel) => { const m = /data-call-id="([^"]+)"/.exec(sel); return m ? { focus: () => focused.push(m[1]) } : null; } };
  const press = (row, key) => row.props.onKeyDown({ key, target: { tagName: "TR" }, currentTarget: { closest: () => list }, preventDefault() {}, stopPropagation() {} });
  press(rows[0], "ArrowDown");
  assert.deepEqual(focused, ["c-done"], "the arrow moves to the next call, across the two tables");
  tree = mount();
  rows = callRows(tree);
  assert.deepEqual(rows.map((r) => r.props["aria-current"]), [undefined, "true"], "and opens it");
  press(rows[0], "Enter");
  assert.deepEqual(callRows(mount()).map((r) => r.props["aria-current"]), ["true", undefined], "Enter opens the row it is on");
});

test("REGRESSION (A16): when the line could not be read, the header says so -- not that there is no phone line", () => {
  withLive([], null);
  const stat = find(mount(), (n) => n.type === "StatCell" && n.props?.label === "Your line");
  assert.notEqual(stat.props.meta, "no phone line yet", "REGRESSION: a failed read said the workspace has no line");
  assert.match(String(stat.props.meta), /couldn't read/i);
});

test("REGRESSION (A20): the hand-over's toast names the line the server rang, which the client nests under data", async () => {
  withLive([call()]);
  const before = flashes.length;
  await byTestId(mount(), "live-hand-over").props.onClick();
  const said = flashes.slice(before).map((m) => textOf(m.msg)).join(" ");
  assert.ok(said.includes(RANG), `REGRESSION: the toast named the line from Settings, not the one rung: ${said}`);
});

test("REGRESSION (A20): before Settings has been read, Pass the call to me stays pressable -- the server knows the line; only a line known to be missing disables it", () => {
  withLive([call()]);
  const facts = globalThis.window.__FACTS;
  try {
    globalThis.window.__FACTS = undefined;
    const unread = byTestId(mount(), "live-hand-over");
    assert.equal(unread.props.disabled, false, "REGRESSION: it said to add a line the workspace may well have");
    assert.ok(!String(unread.props.title).includes("Add the business's own line"));
    globalThis.window.__FACTS = { facts: {} };
    cells = [];
    const none = byTestId(mount(), "live-hand-over");
    assert.equal(none.props.disabled, true, "a line known to be missing still disables it");
    assert.ok(String(none.props.title).includes("Settings"));
  } finally {
    globalThis.window.__FACTS = facts;
  }
});

test("a link names the call it opens, and a call not among these says so, with a door to its transcript", () => {
  withLive([call(), ended()]);
  assert.match(textOf(find(mount({ initialCallId: "c-done" }), (n) => n.props?.className === "lm-head-name")), /Emily Chen/, "the linked call opens, not the one on the line");
  withLive([call()]);
  const tree = mount({ initialCallId: "c-gone" });
  const notice = byTestId(tree, "live-missing");
  assert.ok(notice, "a call that isn't here is said to be missing");
  find(notice, (n) => n.type === "button" && textOf(n).includes("Conversations")).props.onClick();
  assert.equal(went.at(-1), "conversations/cv-c-gone");
});

test("a call gone quiet says when it was last heard from, before the checking banner minutes later", () => {
  withLive([call({ updated_at: iso(40_000) })]);
  assert.match(textOf(find(mount(), (n) => n.props?.className === "lm-head-meta")), /last heard 4\d s ago/);
  withLive([call({ updated_at: iso(2_000) })]);
  assert.doesNotMatch(textOf(find(mount(), (n) => n.props?.className === "lm-head-meta")), /last heard/, "a call heard from seconds ago needs no line about it");
});

/* --------------------------- the shell's live bar --------------------------- */
// A call in progress is true for minutes a week, and it held a permanent slot in
// the phone tab bar -- 60px, with room for neither of the two controls a live
// call has. It is a bar across the top while it is happening instead.

const barAt = (calls, atMs = NOW) => liveBar(toLiveVM(calls, channels, ZONE, new Date(NOW)), atMs);

test("the bar says who is on the phone and how long, and draws nothing when nobody is", () => {
  assert.equal(barAt([ended()]), null, "REGRESSION: an ended call kept the bar up");
  assert.equal(barAt([]), null);
  const one = barAt([call()]);
  assert.equal(one.text, "On the phone now · Rosa", "the caller's first name, the Live page's own whoShort");
  assert.equal(one.callId, "c-live", "and a press opens that call, not the list");
  assert.ok(one.sinceMs >= 90_000 && one.sinceMs < 92_000, `running since it started — ${one.sinceMs}ms`);
  assert.equal(one.checking, false);
});

test("two calls are counted, not named, and open the list", () => {
  const two = barAt([call(), call({ id: "c-live-2", conversation_id: "cv2", contact: { display_name: "Ada Byron", wa_profile_name: null, phone_e164: "+16465550999" } })]);
  assert.equal(two.text, "2 calls on your line now");
  assert.equal(two.callId, null, "no one call to open");
  assert.equal(two.sinceMs, null, "and no clock: whose would it be");
});

test("the heartbeat rule is applied between refreshes, by every reader, from here", () => {
  const vm = toLiveVM([call()], channels, ZONE, new Date(NOW));
  const c = vm.now[0];
  assert.equal(liveStillUp(c, vm.heartbeatMs, NOW), true);
  assert.equal(liveStillUp(c, vm.heartbeatMs, NOW + vm.heartbeatMs + 1), false, "REGRESSION: the phone tab counted `live` alone, so its badge stayed lit for a call nobody had heard from");
  assert.equal(liveBar(vm, NOW + vm.heartbeatMs + 1), null, "and the bar leaves with it, before the next fetch");
  assert.equal(liveStillUp({ ...c, live: false }, vm.heartbeatMs, NOW), false, "a call the read already ended is never up");
});

test("a call the provider has gone quiet about keeps the bar but loses the clock", () => {
  // Marked live, last heard from past LIVE_STALE_MS: toLiveCallVM sets `checking`.
  const quiet = barAt([call({ updated_at: iso(6 * 60_000) })]);
  assert.ok(quiet, "still on the line as far as anyone knows");
  assert.equal(quiet.checking, true);
  assert.equal(quiet.sinceMs, null, "REGRESSION: a number climbing for a call that may already have ended");
});
