/**
 * One thread (docs/plans/2026-09-21-one-thread.md).
 *
 * The Inbox drew a conversation with InboxThread and Conversations drew the same one with CvViewer: two headers,
 * two sets of bubbles, two sets of actions. #746 fixed an email's quoted chain in one of them and said the other
 * drew the same messages the same way; it did not. And Conversations could not act -- "View thread in Inbox" opened
 * a second screen for the same conversation. ThreadPane is the one thread: given a thread, it draws InboxThread and
 * owns the verbs a real thread has; both tabs mount it.
 *
 * Run against the pages on a stub React, never read from them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf, memberWords, toInboxThreadVM } from "@chanlytics/contracts";

const ZONE = "America/New_York";

/* -------------------------------- a browser -------------------------------- */

const listeners = {};
globalThis.window = {
  location: { pathname: "/w/melanys", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  __WORKSPACES: [{ id: "t1", slug: "melanys", name: "Melany's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav: (to) => went.push(to), R: { client: (id) => `clients/${id}`, thread: (id) => `inbox/${id}` }, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  canDo: () => true,
  gate: () => ({}),
  addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
  removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter((f) => f !== fn); },
  dispatchEvent() { return true; },
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
};
globalThis.document = { body: { appendChild() {} }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }) };
const went = [];
const fire = (name) => { for (const fn of listeners[name] ?? []) fn(); };

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
  useMemo: (fn) => fn(),
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatePill", "MoreMenu", "EmptyState", "PolicyChip", "TlMedia", "FailedRead", "Confirm", "usePPToast", "useHotkey"]) globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
await import("../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
await import("../../../apps/dashboard/src/legacy/pages/thread-pane.jsx");
const RealInboxThread = globalThis.window.InboxThread;
globalThis.InboxThread = RealInboxThread;
const { ThreadPane } = globalThis.window;

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => { let hit; walk(tree, (n) => { if (hit === undefined && pred(n)) hit = n; }); return hit; };
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;

// A real thread as the Inbox's read hands it over (toInboxThreadVM's shape, the fields the pane reads).
const rosa = { id: "th-rosa", real: true, who: "Rosa Díaz", conversationId: "c1", state: "escalated", needsYou: true, takenOver: false, claimedByOther: false, archived: false, tags: [], whoMeta: "", lastAtMs: 1000, timeline: [], primaryChannel: "whatsapp" };
const store = (...threads) => { globalThis.window.INBOX_DATA = { THREADS: threads, CHANNEL_LABELS: { whatsapp: "WhatsApp" } }; };
// The pane drawn alone, by the id a Conversations row carries; what it hands InboxThread is caught.
const drawn = [];
const catchPane = () => { drawn.length = 0; globalThis.InboxThread = (p) => { drawn.push(p); return null; }; };
const releasePane = () => { globalThis.InboxThread = RealInboxThread; };
const pane = (props = {}) => { seq = 0; return ThreadPane({ threadId: "th-rosa", ...props }); };
const fresh = () => { cells = []; for (const k of Object.keys(listeners)) delete listeners[k]; };

/* --------------------------------- the pane --------------------------------- */

test("given the id a Conversations row carries, the pane draws InboxThread for that thread", () => {
  fresh(); catchPane(); store(rosa);
  try {
    pane();
    assert.equal(drawn.at(-1).thread.id, "th-rosa");
  } finally { releasePane(); }
});

test("its verbs reach the server with that thread -- the same verbs, from wherever it is open", async () => {
  fresh(); catchPane(); store(rosa);
  const calls = [];
  globalThis.window.__inboxVerb = async (t, verb) => { calls.push([t.id, verb]); return { ok: true, data: {} }; };
  try {
    pane();
    const p = drawn.at(-1);
    p.onTakeOver("th-rosa");
    p.onSnooze("th-rosa");
    p.onArchive("th-rosa");
    const sent = await p.onSend("th-rosa", "See you Friday!");
    assert.deepEqual(calls, [["th-rosa", "take-over"], ["th-rosa", "snooze"], ["th-rosa", "archive"], ["th-rosa", "reply"]]);
    assert.equal(sent, true, "the reply box is told the server took it");
  } finally { delete globalThis.window.__inboxVerb; releasePane(); }
});

test("before the Inbox's read lands, the pane says it is opening -- and opens nobody else's conversation", () => {
  fresh(); catchPane(); store();
  try {
    const tree = pane();
    assert.ok(find(tree, byTestId("tp-opening")), "it says the conversation is on its way");
    assert.equal(drawn.length, 0, "and draws no thread in its place");
  } finally { releasePane(); }
});

test("a re-read that moves the thread says so on the pane; your own act does not, its toast has", async () => {
  fresh(); catchPane(); store(rosa);
  try {
    pane();
    // A teammate handed Rosa back: the next read has her in Handled.
    store({ ...rosa, state: "done", needsYou: false });
    fire("surface:inbox");
    pane();
    assert.equal(drawn.at(-1).notice, "Moved to Handled", "the pane says what happened while you read");

    // Your own archive: its re-read lands inside the verb, the way client/api.ts refreshes after a write.
    fresh(); drawn.length = 0; store(rosa);
    pane();
    globalThis.window.__inboxVerb = async () => {
      store({ ...rosa, state: "done", needsYou: false, archived: true });
      fire("surface:inbox");
      return { ok: true, data: {} };
    };
    drawn.at(-1).onArchive("th-rosa");
    await new Promise((r) => setTimeout(r, 0));
    pane();
    assert.equal(drawn.at(-1).notice, null, "REGRESSION: the pane announced your own act to you");
  } finally { delete globalThis.window.__inboxVerb; releasePane(); }
});

/* ---------------------------- a draft counting down ---------------------------- */

// Moved here from veto-ui.test.mjs, where it read inbox.jsx as a string: the hold is a function now, so it is run.
test("a draft's Hold and your first keystroke both withdraw it on the server; a withdrawal that failed claims no hold", async () => {
  const { threadVerbs, ixHeld } = globalThis.window;
  const said = [];
  const { hold } = threadVerbs((m) => said.push(m));
  globalThis.window.VW_STORE = { state: {} };
  const asked = [];
  globalThis.window.__cancelSend = async (id) => { asked.push(id); return { ok: true }; };
  const draft = (messageId) => ({ ...rosa, veto: { messageId, endsAtMs: Date.now() + 20_000, draft: "See you at 3" } });
  const a = draft("m-hold");
  const b = draft("m-type");
  try {
    hold(a, "hold");
    hold(b, "type");
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(asked, ["m-hold", "m-type"], "both went to the server, each for its own draft");
    assert.ok(ixHeld(globalThis.window.VW_STORE.state, a) && ixHeld(globalThis.window.VW_STORE.state, b));
    hold(a, "hold");
    assert.equal(asked.length, 2, "a draft already withdrawn is not asked about again");

    // It may already have gone out: the refusal is said, and no hold is claimed.
    globalThis.window.__cancelSend = async () => ({ ok: false, message: "It had already been sent." });
    const late = draft("m-late");
    hold(late, "hold");
    assert.ok(ixHeld(globalThis.window.VW_STORE.state, late), "the countdown stops at once");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(ixHeld(globalThis.window.VW_STORE.state, late), false, "REGRESSION: the UI claimed a hold that never happened");
    assert.equal(said.at(-1).tone, "danger", "and says the server's refusal");
  } finally {
    delete globalThis.window.__cancelSend;
  }
});

/* ------------------------------- the thread's menu ------------------------------- */

const NOW = new Date("2026-09-14T14:00:00Z");
const at = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
// A conversation as GET conversations returns it, made a thread by the Inbox's own view model.
const convo = (over = {}) => ({
  id: "c1", state: "open", paused_until: null, snooze_until: null, assignee_user_id: null, assignee_is_me: false,
  last_wa_inbound_at: at(60), last_message_at: at(59),
  contact: { id: "k1", display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+13475550101", consent: "opted_in", dnc: false },
  messages: [
    { id: "m1", direction: "inbound", sender: "customer", type: "text", body: "Do you have Friday?", media: null, meta: null, status: "received", channel: "whatsapp", created_at: at(60), channel_ts: at(60) },
    { id: "m2", direction: "outbound", sender: "ai", type: "text", body: "Yes, 3pm works.", media: null, meta: null, status: "read", channel: "whatsapp", created_at: at(59), channel_ts: at(59) },
  ],
  ...over,
});

test("Export is in the thread's menu, from the conversation's own route -- in whichever tab the thread is open", () => {
  fresh(); releasePane();
  const vm = toInboxThreadVM(convo(), null, ZONE, NOW);
  globalThis.window.INBOX_DATA = { THREADS: [vm], CHANNEL_LABELS: { whatsapp: "WhatsApp" } };
  globalThis.window.__href = (route, p) => `${route}|${p.id}`;
  const anchors = [];
  const realCreate = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => {
    const a = { tag, href: null, download: null, clicked: 0, click() { this.clicked += 1; }, remove() {}, setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } };
    anchors.push(a);
    return a;
  };
  try {
    seq = 0;
    const tree = ThreadPane({ threadId: vm.id });
    const menu = find(tree, (n) => n.type === globalThis.MoreMenu);
    assert.ok(menu, "the thread has its menu");
    const item = menu.props.items.find((it) => it.label === "Export");
    assert.ok(item, "REGRESSION: Export was a button in Conversations' header only");
    item.onClick();
    const a = anchors.find((x) => x.tag === "a");
    assert.equal(a.href, "GET conversations/[id]/export|c1", "the file the conversation's own route writes");
    assert.equal(a.download, "", "fetched as a file, not opened as a page");
    assert.equal(a.clicked, 1);
  } finally {
    globalThis.document.createElement = realCreate;
    delete globalThis.window.__href;
  }
});
