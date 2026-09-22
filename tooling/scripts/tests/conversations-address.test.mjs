/**
 * Conversations, the loading standard's E and F: the row open on its tab is the address's, and the box's words are
 * kept per tab.
 *
 * - The address held a tab OR a row (`conversations/phone`, `conversations/cv-4`), so the row a person had open on a
 *   tab was nobody's after a refresh, and no link could name it. The page's one rule (CV_ROUTE) reads `<tab>:<id>`
 *   too, its twin (CV_ADDRESS) spells it, and a row pressed writes it (replaced, never pushed, as the Inbox and Live
 *   do), so a refresh opens the same row on the same tab and Back leaves the page.
 * - A search typed on Phone was gone after a trip to People: it is kept per tab in the tab's storage (tab-memory.ts),
 *   and a tab pressed opens with the words last typed on it.
 * Run against the page on a stub React, with the tab's memory installed as the app installs it.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { toConversationVM, toCallVM, stateOf } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");

/* ---------------------------------- the window ---------------------------------- */

const listeners = {};
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
const went = [];
globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/conversations",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {} },
  innerHeight: 800,
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => {
    (listeners[type] ||= new Set()).add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners[type]?.delete(fn);
  },
  dispatchEvent: (ev) => {
    for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
    return true;
  },
  setInterval: () => 1,
  clearInterval() {},
  __DEMO_MODE: false,
  __chrome: { state: stateOf },
  CHANLY: {
    nav: (to) => went.push(["nav", to]),
    R: { client: (id) => `clients/${id}`, thread: (id) => `inbox/${id}` },
  },
  appNavigate: (to, opts) => went.push(["app", to, opts || null]),
  canDo: () => true,
  gate: () => ({}),
};
const { installTabMemory, clearTabMemory } = await import("../../../apps/dashboard/src/legacy-bridge/tab-memory.ts");
installTabMemory(globalThis.window);
const TM = globalThis.window.__tabMemory;

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
  useState: (init) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: (fn, deps) => {
    const k = seq++;
    const prev = cells[k];
    if (
      prev &&
      deps &&
      prev.deps &&
      deps.length === prev.deps.length &&
      deps.every((d, i) => Object.is(d, prev.deps[i]))
    )
      return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = { deps, cleanup: undefined };
    cells[k].cleanup = fn();
  },
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of [
  "StatePill",
  "MoreMenu",
  "EmptyState",
  "PolicyChip",
  "TlMedia",
  "FailedRead",
  "Confirm",
  "usePPToast",
  "useHotkey",
])
  globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
await import("../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
await import("../../../apps/dashboard/src/legacy/pages/thread-pane.jsx");
globalThis.InboxThread = globalThis.window.InboxThread;
globalThis.ThreadPane = globalThis.window.ThreadPane;
globalThis.ThreadCall = globalThis.window.ThreadCall;
await import("../../../apps/dashboard/src/legacy/pages/conversations.jsx");
const { ConversationsPage, CV_ROUTE: route, CV_ADDRESS: address } = globalThis.window;

/* ---------------------------------- walking a tree ---------------------------------- */

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  if (n.rendered !== undefined) walk(n.rendered, fn);
  else walk(n.props?.children, fn);
};
const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
const rows = (tree) => all(tree, (n) => String(n.props?.className || "").startsWith("cv-row "));
const searchBox = (tree) =>
  find(tree, (n) => n.type === "input" && String(n.props?.placeholder || "").startsWith("Search names"));
/** A fresh mount, as React mounts the page a person came back to. */
const fresh = () => {
  cells = [];
  seq = 0;
  went.length = 0;
};
/** The page drawn again over the same cells, as React draws it after a state change or a new prop. */
const redraw = (props) => {
  seq = 0;
  return ConversationsPage(props);
};

/* ---------------------------------- the rows ---------------------------------- */

const msg = (over = {}) => ({
  id: "m",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Do you have Friday?",
  media: null,
  meta: null,
  status: "received",
  created_at: "2026-09-14T13:00:00Z",
  ...over,
});
const ours = (over = {}) =>
  msg({
    id: "m2",
    direction: "outbound",
    sender: "ai",
    body: "Yes, 3pm works.",
    status: "sent",
    created_at: "2026-09-14T13:01:00Z",
    ...over,
  });
const conv = (id, name, messages) => ({
  id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: "2026-09-14T13:00:00Z",
  last_message_at: "2026-09-14T13:01:00Z",
  contact: {
    id: `k-${id}`,
    display_name: name,
    wa_profile_name: null,
    phone_e164: "+13475550101",
    consent: "opted_in",
    dnc: false,
  },
  messages,
});
const call = (id, name) =>
  toCallVM(
    {
      id,
      retell_call_id: `r-${id}`,
      direction: "inbound",
      call_type: "phone_call",
      status: "ended",
      from_e164: "+19175550106",
      from_raw: null,
      to_e164: "+13083368109",
      started_at: "2026-09-14T13:00:00Z",
      ended_at: "2026-09-14T13:03:10Z",
      duration_ms: 190_000,
      disconnection_reason: "agent_hangup",
      sentiment: "Positive",
      call_successful: true,
      in_voicemail: false,
      summary: "The caller asked about a bridal trial.",
      transcript_object: null,
      recording: null,
      conversation_id: `cv-${id}`,
      contact_id: `k-${id}`,
      message_id: `m-${id}`,
      contact: { display_name: name, wa_profile_name: null, phone_e164: "+19175550106" },
      wanted: null,
      outcome: null,
      follow_up: null,
      caller_name: name,
    },
    ZONE,
    NOW,
  );
const rosa = toConversationVM(conv("c1", "Rosa Díaz", [msg({ id: "m1" }), ours()]), ZONE, NOW);
const emily = call("k7", "Emily Chen");
const withRows = (list) => {
  globalThis.window.CONVERSATIONS_DATA = {
    CONVERSATIONS: list,
    CV_CHANNELS: [
      { id: "all", label: "All" },
      { id: "whatsapp", label: "WhatsApp" },
      { id: "phone", label: "Phone" },
    ],
    CALLS_READ: true,
  };
};

beforeEach(() => {
  fresh();
  clearTabMemory();
  globalThis.window.INBOX_DATA = { THREADS: [], CHANNEL_LABELS: { whatsapp: "WhatsApp" } };
  withRows([rosa, emily]);
});

/* ---------------------------------- E: the address ---------------------------------- */

test("the one rule reads a tab, a row, or a row on its tab -- and its twin spells them back", () => {
  assert.deepEqual(route("phone"), { channel: "phone", id: null });
  assert.deepEqual(route("cv-4"), { channel: "all", id: "cv-4" });
  assert.deepEqual(route("phone:cv-4"), { channel: "phone", id: "cv-4" }, "the row open on its tab");
  assert.deepEqual(route("whatsapp:5b0c6a52-8f1e-4d7a-9c1b-2e7f3a9d4c10"), {
    channel: "whatsapp",
    id: "5b0c6a52-8f1e-4d7a-9c1b-2e7f3a9d4c10",
  });
  assert.deepEqual(route("all:cv-4"), { channel: "all", id: "cv-4" }, "All, said in full");
  assert.deepEqual(route("phone:"), { channel: "phone", id: null }, "a tab with nothing after its colon is the tab");
  assert.deepEqual(
    route("nobody:cv-4"),
    { channel: "all", id: "nobody:cv-4" },
    "a word that is no tab is an id, colon and all, as it was",
  );
  assert.equal(address("all", null), "conversations");
  assert.equal(address("phone", null), "conversations/phone");
  assert.equal(address("all", "cv-4"), "conversations/cv-4", "on All a row is spelled as every link spells it");
  assert.equal(address("phone", "cv-4"), "conversations/phone:cv-4");
  for (const [tab, id] of [
    ["all", null],
    ["phone", null],
    ["all", "cv-4"],
    ["whatsapp", "cv-4"],
  ]) {
    assert.deepEqual(
      route(address(tab, id).replace(/^conversations\/?/, "") || undefined),
      { channel: tab, id },
      `${tab}:${id} goes round`,
    );
  }
});

test("a row pressed is the address's, on its tab, replaced -- and the pane opens it; a tab pressed is a new entry", () => {
  let tree = ConversationsPage({ channel: "phone", initialId: null });
  assert.equal(rows(tree).length, 1, "the phone's rows");
  press(rows(tree)[0]);
  assert.deepEqual(
    went,
    [["app", "conversations/phone:cv-k7", { replace: true }]],
    "REGRESSION: the row a person opened was nowhere in the address",
  );
  tree = redraw({ channel: "phone", initialId: "cv-k7" });
  assert.ok(String(rows(tree)[0].props.className).includes("active"), "and it is the one open");
  assert.ok(
    String(find(tree, (n) => String(n.props?.className || "").startsWith("conversations")).props.className).includes(
      "phone-detail",
    ),
    "the phone's turn for the pane",
  );

  // On All, a row is spelled as every other link spells it.
  fresh();
  tree = ConversationsPage({ channel: "all", initialId: null });
  press(rows(tree).find((r) => textOf(r).includes("Rosa")));
  assert.deepEqual(went, [["app", "conversations/c1", { replace: true }]]);

  // A tab pressed is a new place: pushed, by the same spelling.
  fresh();
  tree = ConversationsPage({ channel: "all", initialId: null });
  press(byTestId(tree, "cv-tab-phone"));
  press(byTestId(tree, "cv-tab-all"));
  assert.deepEqual(went, [
    ["nav", "conversations/phone"],
    ["nav", "conversations"],
  ]);
});

test("a link to a row on a tab opens that row on that tab, and a search that hides it keeps it open", () => {
  let tree = ConversationsPage({ channel: "phone", initialId: "cv-k7" });
  assert.ok(String(rows(tree)[0].props.className).includes("active"));
  assert.equal(byTestId(tree, "cv-call-pane") !== null, true, "the call's pane");
  searchBox(tree).props.onChange({ target: { value: "rosa" } });
  tree = redraw({ channel: "phone", initialId: "cv-k7" });
  assert.equal(rows(tree).length, 0, "the words hide its row");
  assert.ok(byTestId(tree, "cv-call-pane"), "and the pane keeps the row asked for, never the list's first");
});

/* ---------------------------------- F: the box's words ---------------------------------- */

test("the box's words are kept per tab, in the tab's storage: back after a trip away, and each tab's own when a tab is pressed", () => {
  let tree = ConversationsPage({ channel: "all", initialId: null });
  searchBox(tree).props.onChange({ target: { value: "rosa" } });
  tree = redraw({ channel: "all", initialId: null });
  assert.equal(searchBox(tree).props.value, "rosa");
  assert.deepEqual(TM.place("conversations", "all"), { q: "rosa" }, "kept as typed");
  // The page is one mount across its tabs: Phone pressed is the same page with a new channel, and its own words.
  tree = redraw({ channel: "phone", initialId: null });
  assert.equal(searchBox(tree).props.value, "", "Phone has none yet");
  assert.equal(rows(tree).length, 1, "and its rows are not filtered by All's words");
  searchBox(tree).props.onChange({ target: { value: "emily" } });
  tree = redraw({ channel: "phone", initialId: null });
  assert.deepEqual(TM.place("conversations", "phone"), { q: "emily" });
  tree = redraw({ channel: "all", initialId: null });
  assert.equal(searchBox(tree).props.value, "rosa", "back on All, All's words");
  // Left for People and come back to: the words are there.
  fresh();
  tree = ConversationsPage({ channel: "phone", initialId: null });
  assert.equal(searchBox(tree).props.value, "emily", "REGRESSION: a search typed on Phone was gone after a trip away");
  // Cleared, forgotten: a place with nothing in it is not kept.
  searchBox(tree).props.onChange({ target: { value: "" } });
  assert.equal(TM.place("conversations", "phone"), null);
  // Signed out, gone.
  clearTabMemory();
  assert.equal(TM.place("conversations", "all"), null);
});
