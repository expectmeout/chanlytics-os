/**
 * The Inbox list and its counts say what is true (I2).
 *
 * Seen on the salon's workspace and in the code, 15 Sep 2026:
 * - the Needs you chip counted every flagged thread -- yours, a teammate's, and one you had just answered, which
 *   stays flagged for the whole pause -- while the badge and the tab counted what needs you;
 * - every row in Needs you wore "NEEDS YOU", a thread you own included: the check that drops the pill a bucket
 *   already says looks for the mockup's bucket, "needs", which no real thread is ever in;
 * - a thread you have, or a teammate has, waited in amber as if it were waiting on you;
 * - a Handled row whose last reply never left looked like every other;
 * - opening a thread cleared the dot that means it needs you, until the next read lit it again;
 * - the sidebar's first count used the old rule and counted a teammate's threads;
 * - the bulk snooze's Undo said "back where they were", where a snooze lets go of whoever had them.
 * Run against the contracts, and the pages drawn on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-15T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const later = new Date(NOW.getTime() + 3 * 3_600_000).toISOString();
const ANA = "u-ana";
const TEAM = [{ userId: ANA, email: "ana@melanys.com", displayName: "Ana García" }];
const person = (id, name) => ({ id, display_name: name, wa_profile_name: null, phone_e164: "+16465550123", consent: "opted_in", dnc: false });
const wrote = (id, body, min) => ({ id, direction: "inbound", sender: "customer", type: "text", body, media: null, meta: null, status: "received", created_at: ago(min), channel_ts: ago(min) });
const ours = (id, sender, body, min, status = "delivered") => ({ id, direction: "outbound", sender, type: "text", body, media: null, meta: null, status, created_at: ago(min), channel_ts: ago(min) });
const conv = (id, name, over = {}) => ({
  id, state: "needs_human", paused_until: null, snooze_until: null, assignee_user_id: null, assignee_is_me: false,
  last_wa_inbound_at: ago(40), last_message_at: ago(40), contact: person(`p-${id}`, name),
  messages: [wrote(`m-${id}`, "Can I move my appointment?", 40)], ...over,
});
const asked = (id, min) => ({ id: `e-${id}`, reason: "human_token", details: null, state: "open", created_at: ago(min) });

// Three flagged threads, as the salon's Needs you bucket can hold them: one nobody has, one you have, one Ana has;
// and a Handled thread whose last reply never left.
const rosa = toInboxThreadVM(conv("c1", "Rosa Díaz"), asked("c1", 90), ZONE, NOW);
const mine = toInboxThreadVM(conv("c2", "Nina Park", { paused_until: later, assignee_user_id: "u-me", assignee_is_me: true }), asked("c2", 120), ZONE, NOW);
const anas = toInboxThreadVM(conv("c3", "Ada Lovelace", { paused_until: later, assignee_user_id: ANA, assignee_is_me: false }), asked("c3", 150), ZONE, NOW);
const unsent = toInboxThreadVM(conv("c4", "Zoe Martin", { state: "open", messages: [wrote("m-c4", "Can I book at 3?", 30), ours("m-c4b", "ai", "3pm works!", 29, "failed")] }), null, ZONE, NOW);

test("the fixtures stand where the salon's threads stand", () => {
  assert.deepEqual([rosa.state, rosa.needsYou], ["escalated", true]);
  assert.deepEqual([mine.state, mine.takenOver, mine.needsYou], ["escalated", true, false]);
  assert.deepEqual([anas.state, anas.claimedByOther, anas.needsYou], ["escalated", true, false]);
  assert.deepEqual([unsent.state, unsent.lastWord.short], ["done", "Didn't send"]);
});

/* -------------------------------- a browser -------------------------------- */

const counted = [];
globalThis.window = {
  location: { pathname: "/w/melanys", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent(e) { if (e && e.type === "inbox:counts") counted.push(e.detail.needs); return true; },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
globalThis.document = { visibilityState: "hidden", body: { appendChild() {} }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }) };

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
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatePill", "MoreMenu", "EmptyState", "PolicyChip", "TlMedia", "FailedRead", "Confirm", "usePPToast", "useHotkey"]) globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
const RealInboxList = globalThis.window.InboxList;
await import("../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
await import("../../../apps/dashboard/src/legacy/pages/inbox.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => { let hit; walk(tree, (n) => { if (hit === undefined && pred(n)) hit = n; }); return hit; };
const findAll = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const hasClass = (cls) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const buttonNamed = (tree, words) => find(tree, (n) => n.type === "button" && textOf(n).trim() === words);

const REAL_BUCKETS = [{ id: "escalated", label: "Needs you", icon: "flag", accent: true }, { id: "done", label: "Handled", icon: "check" }, { id: "snoozed", label: "Snoozed", icon: "clock" }];
const inboxWith = (threads) => { globalThis.window.INBOX_DATA = { INBOX_BUCKETS: REAL_BUCKETS, INBOX_VIEWS: [], CHANNEL_LABELS: {}, INBOX_BASELINE: { doneThisWeek: 0 }, THREADS: threads }; };
/** The Inbox page, with the list and the pane replaced by recorders of what they were given. */
const page = (threads) => {
  const seen = { list: null, pane: null };
  globalThis.InboxList = (p) => { seen.list = p; return null; };
  globalThis.InboxThread = (p) => { seen.pane = p; return null; };
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  inboxWith(threads);
  cells = [];
  const render = () => { seq = 0; return globalThis.window.Inbox({ showAgentRail: false }); };
  render();
  return { seen, render };
};
const listProps = (over = {}) => ({
  threads: [rosa, mine, anas], allThreads: [rosa, mine, anas, unsent],
  buckets: [{ id: "escalated", label: "Needs you", icon: "flag", count: 1 }], views: [],
  activeBucket: "escalated", onBucketChange() {},
  activeThreadId: rosa.id, onSelectThread() {},
  selected: [], onToggleSelect() {}, onClearSelection() {},
  ...over,
});

/* --------------------------------- the page --------------------------------- */

test("the Needs you chip counts what needs you, the badge's number -- not every thread flagged for a person", () => {
  counted.length = 0;
  const { seen } = page([anas, mine, rosa, unsent]);
  const chip = (id) => seen.list.buckets.find((b) => b.id === id).count;
  assert.equal(chip("escalated"), 1, "REGRESSION: it counted the thread you have and Ana's too, under a badge that said 1");
  assert.equal(counted.at(-1), 1, "the badge's own number");
  assert.deepEqual([chip("done"), chip("snoozed")], [1, 0], "the other chips count what they hold");
});

test("Needs you lists what needs you first, then the threads you have, then a teammate's -- and opens on the one that needs you", () => {
  const { seen } = page([anas, mine, rosa]);
  assert.deepEqual(seen.list.threads.map((t) => t.who), ["Rosa Díaz", "Nina Park", "Ada Lovelace"], "REGRESSION: in the order they last moved, a teammate's thread above the one waiting on you");
  assert.equal(seen.pane.thread.id, rosa.id, "REGRESSION: the pane opened on Ada's thread, which Ana is answering");
});

test("opening a thread that needs you keeps its dot: on a real thread the dot means it needs you, not that it is unread", () => {
  const { seen, render } = page([mine, rosa]);
  seen.list.onSelectThread(rosa.id);
  render();
  assert.equal(seen.list.threads.find((t) => t.id === rosa.id).unread, true, "REGRESSION: opening it cleared the dot, and the next read lit it again");
  const seeded = { id: "t-seed", real: false, who: "Aisha", state: "needs", unread: true, tags: [], whoMeta: "", timeline: [], agent: { name: "Front Desk", glyph: "F" } };
  const demo = page([seeded]);
  demo.seen.list.onSelectThread("t-seed");
  demo.render();
  assert.equal(demo.seen.list.threads.find((t) => t.id === "t-seed").unread, false, "the demo's unread dot still clears when it is read");
});

test("the bulk snooze's Undo says they are back in the Inbox -- a snooze lets go of whoever had them, so not 'back where they were'", async () => {
  const { seen, render } = page([rosa, mine]);
  globalThis.window.__inboxBulk = (threads) => Promise.resolve({ done: threads, refused: [] });
  try {
    seen.list.onToggleSelect(rosa.id);
    render();
    seen.list.onToggleSelect(mine.id);
    render();
    await seen.list.onBulkSnooze();
    let tree = render();
    const toasts = () => findAll(tree, (n) => typeof n.props?.className === "string" && n.props.className.startsWith("pp-toast "));
    buttonNamed(toasts().find((t) => /snoozed/.test(textOf(t))), "Undo").props.onClick();
    await new Promise((r) => setTimeout(r, 0));
    tree = render();
    const said = toasts().map(textOf).join(" | ");
    assert.match(said, /Snooze undone — 2 back in the Inbox/);
    assert.ok(!said.includes("back where"), "REGRESSION: 'back where they were', for a thread whose claim the snooze had let go");
  } finally {
    delete globalThis.window.__inboxBulk;
  }
});

/* --------------------------------- the list --------------------------------- */

test("each row says whose it is -- nothing more where the bucket already says Needs you, 'You have it', 'Ana García has it' -- and waits in amber only when the wait is on you", () => {
  globalThis.window.__TEAM = TEAM;
  try {
    cells = [];
    const draw = (over = {}) => { seq = 0; return RealInboxList(listProps(over)); };
    let tree = draw();
    const row = (who) => find(tree, (n) => n.props?.role === "option" && textOf(n).includes(who));
    // The pills as drawn: the spans, not the StatePill elements that draw them.
    const pills = (r) => findAll(r, (n) => n.type === "span" && hasClass("ix-state-pill")(n)).map(textOf);
    assert.deepEqual(pills(row("Rosa Díaz")), [], "REGRESSION: 'NEEDS YOU' on every row of the Needs you bucket");
    assert.deepEqual(pills(row("Nina Park")), ["You have it"], "REGRESSION: a thread you own read NEEDS YOU");
    assert.deepEqual(pills(row("Ada Lovelace")), ["Ana García has it"]);
    const amber = (who) => hasClass("warn")(find(row(who), hasClass("ix-wait")));
    assert.deepEqual([amber("Rosa Díaz"), amber("Nina Park"), amber("Ada Lovelace")], [true, false, false], "REGRESSION: a thread you have waited in amber as if it were waiting on you");
    assert.equal(textOf(find(tree, hasClass("ix-list-count"))), "1 needs you · 2 being answered", "REGRESSION: '3 threads' under a chip that counts what needs you");

    // A search spans every bucket, so a row there says Needs you again -- only the one that does.
    find(tree, (n) => n.type === "input" && n.props?.className === "ix-search-input").props.onChange({ target: { value: "a" } });
    tree = draw();
    assert.deepEqual(
      ["Rosa Díaz", "Nina Park", "Ada Lovelace", "Zoe Martin"].map((who) => pills(row(who))),
      [["Needs you"], ["You have it"], ["Ana García has it"], ["Didn't send"]],
      "REGRESSION: a search listed a thread you own as Needs you",
    );

    cells = [];
    tree = draw({ threads: [unsent], allThreads: [unsent], activeBucket: "done", activeThreadId: unsent.id });
    assert.deepEqual(pills(row("Zoe Martin")), ["Didn't send"], "REGRESSION: a Handled row whose last reply never left looked like every other");
  } finally {
    globalThis.window.__TEAM = null;
  }
});

/* -------------------------------- the sidebar -------------------------------- */

test("the sidebar's first count is the badge's: what needs you, not every flagged thread nobody in this tab holds", async () => {
  await import("../../../apps/dashboard/src/legacy/components/sidebar.jsx");
  inboxWith([rosa, mine, anas, unsent]);
  assert.equal(globalThis.window.sbNeedsCount(), 1, "REGRESSION: it counted Ana's thread as waiting on you until the Inbox mounted");
});
