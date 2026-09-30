/**
 * The decision fits every screen, and a keyboard and a screen reader can follow it (I3).
 *
 * Measured on the salon's workspace, 15 Sep 2026, look-only:
 * - the Needs you banner put its words and its two buttons on one line: the words were 182px wide at 1280, 0px at
 *   1024 and on a phone, where the hand-back button ended 95px past the screen;
 * - a thread you have kept the customer's words out of sight, where you answer them;
 * - a draft past its deadline read "Auto-sends in 0s" until something else moved, and a screen reader heard nothing
 *   of the countdown or of a hold;
 * - a hold was kept against the thread, not the draft: the next draft on that thread read "Held — manual send"
 *   while the server sent it;
 * - the buckets did not say which was open, and the select-all box was named by the count beside it.
 * The layout itself is measured by the nightly (thread.spec.ts) and on the live page; here, the markup and the
 * rules it rests on, on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords, replyWaitsOnYou } from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";
import { kitPages } from "../../_legacy-react.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-15T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const later = new Date(NOW.getTime() + 3 * 3_600_000).toISOString();
const rosa = {
  id: "p1",
  display_name: "Rosa Díaz",
  wa_profile_name: null,
  phone_e164: "+16465550123",
  consent: "opted_in",
  dnc: false,
};
const wrote = (id, body, min) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  created_at: ago(min),
  channel_ts: ago(min),
});
const chat = (over = {}) => ({
  id: "c1",
  state: "needs_human",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(40),
  last_message_at: ago(40),
  contact: rosa,
  messages: [wrote("m1", "Can I move my appointment to Friday?", 40)],
  ...over,
});
const asked = (over = {}) => ({
  id: "e1",
  reason: "human_token",
  details: null,
  state: "open",
  created_at: ago(40),
  ...over,
});
const callNote = {
  id: "m9",
  direction: "inbound",
  sender: "system",
  type: "call_summary",
  body: "Inbound call · 3 min — asked about a bridal trial",
  media: null,
  meta: {},
  status: "received",
  created_at: ago(56),
  channel_ts: ago(56),
};
const callback = asked({
  reason: "callback",
  details: "Call Rosa back to confirm the bridal trial on Oct 3",
  created_at: ago(55),
});
const draft = {
  id: "m3",
  direction: "outbound",
  sender: "ai",
  type: "text",
  body: "Friday at 3 works. Shall I book it?",
  media: null,
  meta: { delay_ms: 90_000 },
  status: "queued",
  created_at: ago(0.5),
  channel_ts: null,
};
const vmOf = (dto, esc = null) => toInboxThreadVM(dto, esc, ZONE, NOW);

/* -------------------------------- a browser -------------------------------- */

globalThis.window = {
  location: {
    pathname: "/w/marisas",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __chrome: { state: stateOf, replyWaits: replyWaitsOnYou },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
globalThis.document = {
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }),
};

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = fn();
    return cells[k];
  },
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.useSurface = () => 0; // the bridge's hook: these tests draw once, and the redraw is proved in shell/surfaces
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
Object.assign(globalThis.window, kitPages);
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
await import("../../../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
await import("../../../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
// The one thread, which the Inbox mounts (thread-pane.jsx): loaded first, published as the page reads it.
await import("../../../../../apps/dashboard/src/legacy/pages/thread-pane.jsx");
globalThis.ThreadPane = globalThis.window.ThreadPane;
await import("../../../../../apps/dashboard/src/legacy/pages/inbox.jsx");
const { InboxList, InboxThread } = globalThis.window;

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => {
  let hit;
  walk(tree, (n) => {
    if (hit === undefined && pred(n)) hit = n;
  });
  return hit;
};
const hasClass = (cls) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls);
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const buttonsOf = (tree) => {
  const out = [];
  walk(tree, (n) => {
    if (n.type === "button") out.push(textOf(n).trim());
  });
  return out;
};
const paneOf = (thread, over = {}) => {
  cells = [];
  frames.begin();
  return InboxThread({ thread, channelLabels: { whatsapp: "WhatsApp", phone: "Phone" }, ...over });
};

/* --------------------------------- the pane --------------------------------- */

test("the Needs you line keeps its words and its buttons apart: the words take the width, and the buttons never share their row", () => {
  const take = find(
    paneOf(vmOf(chat({ last_wa_inbound_at: null, messages: [callNote] }), callback)),
    byTestId("ix-needs-you"),
  );
  const actions = find(take, hasClass("ix-state-acts"));
  assert.ok(actions, "REGRESSION: the buttons shared the words' row, and at 1024 the words were 0px wide");
  // One press dials and claims it: "I'll call them" only claimed it, over a reply box whose own Call back only
  // dialled, under a banner that said to call them back, under a sentence that said it first.
  const call = find(actions, (n) => n.type === "a");
  assert.ok(call && String(call.props.href).startsWith("tel:"), "the call is the primary action");
  assert.equal(textOf(call).trim(), "Call back");
  assert.deepEqual(buttonsOf(actions), ["Hand back"], "and the way out, in two words");
  assert.equal(
    find(find(take, hasClass("ix-state-says")), hasClass("ix-state-acts")),
    undefined,
    "beside the pill, never inside the words",
  );
  // The to-do is the line's own words, said once (calls you can follow).
  assert.match(textOf(find(take, hasClass("ix-state-says"))), /Call Rosa back to confirm the bridal trial/);
});

test("a thread you have shows what they asked, where you answer it", () => {
  const mine = vmOf(chat({ paused_until: later, assignee_user_id: "u-me", assignee_is_me: true }), asked());
  const pane = paneOf(mine);
  assert.equal(textOf(find(pane, byTestId("ix-th-standing"))), "You have it", "named in the bar under the header");
  const owned = find(pane, byTestId("ix-yours"));
  assert.ok(owned && textOf(owned).startsWith("The receptionist stays quiet"));
  assert.equal(
    textOf(find(owned, byTestId("ix-take-ask"))),
    "They wrote“Can I move my appointment to Friday?”",
    "REGRESSION: the words you are answering were only in the timeline",
  );
  let back = null;
  walk(owned, (n) => {
    if (n.type === "button" && textOf(n).trim() === "Hand back") back = n;
  });
  assert.ok(
    back && String(back.props["aria-label"]).startsWith("Hand back to"),
    "and the way to give it back, its whole sentence for a screen reader",
  );
});

test("the countdown is a timer; past its deadline a real draft says it is sending, not 'Auto-sends in 0s'; a hold is said to a screen reader", () => {
  const vm = vmOf(chat({ state: "open", messages: [wrote("m1", "Can I move my appointment to Friday?", 2), draft] }));
  const bar = (remaining) => find(paneOf(vm, { veto: remaining }), hasClass("ix-veto"));
  const said = (b) => textOf(find(b, (n) => n.props?.role === "status"));
  const counting = bar(42);
  assert.equal(find(counting, hasClass("ix-veto-msg")).props.role, "timer");
  assert.match(textOf(counting), /Auto-sends in 42s/);
  assert.equal(said(counting), "", "a number that changes every second is not read aloud");
  const zero = bar(0);
  assert.match(textOf(zero), /Sending now…/, "REGRESSION: 'Auto-sends in 0s' until something else moved");
  assert.ok(!/in 0s/.test(textOf(zero)));
  assert.equal(said(zero), "Sending now.");
  assert.equal(said(bar(null)), "Held — this draft will not send.");
});

/* -------------------------------- the engine -------------------------------- */

test("past a draft's deadline the Inbox reads again every five seconds while the draft is still there, six times at most", () => {
  const st = {};
  const at = [0, 1000, 5000, 5200, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000];
  assert.deepEqual(
    at.map((ms) => globalThis.window.ixReadAgain(st, ms)),
    [true, false, true, false, true, true, true, true, false, false],
    "REGRESSION: it read once at zero, and 'Auto-sends in 0s' stayed until something else moved",
  );
});

test("a hold belongs to the draft it held: the next draft on the same thread counts down, not 'Held'", async () => {
  const state = {};
  const first = { id: "th-1", real: true, who: "Rosa Díaz", veto: { messageId: "m1", endsAtMs: 1 } };
  const r = await globalThis.window.ixHoldAll([first], { state, cancelSend: async () => ({ ok: true }) });
  assert.equal(r.held, 1);
  assert.equal(globalThis.window.ixHeld(state, first), true);
  const next = { ...first, veto: { messageId: "m2", endsAtMs: 2 } };
  assert.equal(
    globalThis.window.ixHeld(state, next),
    false,
    "REGRESSION: the next draft on the thread read 'Held — manual send', and the server sent it",
  );
  const seeded = { id: "t-seed", real: false, who: "Aisha", veto: { window: 30, draft: "Hi" } };
  await globalThis.window.ixHoldAll([seeded], { state, cancelSend: null });
  assert.equal(globalThis.window.ixHeld(state, seeded), true, "the demo's hold is still the thread's");
});

test("the countdown on screen, and the Hold that stops it, read and write the draft's own record", () => {
  let pane = null;
  globalThis.InboxList = () => null;
  globalThis.InboxThread = (p) => {
    pane = p;
    return null;
  };
  globalThis.InboxAgentRail = () => null;
  globalThis.window.VW_UTIL = { seed() {}, remaining: () => null };
  const vm = vmOf(chat({ state: "open", messages: [wrote("m1", "Can I move my appointment to Friday?", 2), draft] }));
  const draw = (state) => {
    globalThis.window.VW_STORE = { state };
    globalThis.window.INBOX_DATA = {
      INBOX_BUCKETS: [
        { id: "escalated", label: "Needs you" },
        { id: "done", label: "Handled" },
      ],
      INBOX_VIEWS: [],
      CHANNEL_LABELS: {},
      INBOX_BASELINE: {},
      THREADS: [vm],
    };
    cells = [];
    frames.begin();
    globalThis.window.Inbox({ showAgentRail: false });
    return pane;
  };
  assert.equal(
    typeof draw({ [vm.id]: { held: true } }).veto,
    "number",
    "REGRESSION: a hold kept against the thread stopped the next draft's countdown on screen, and the server sent it",
  );
  assert.equal(draw({ "draft:m3": { held: true } }).veto, null, "the draft's own hold stops its countdown");
  const state = {};
  globalThis.window.__cancelSend = () => new Promise(() => {});
  try {
    draw(state).onVetoAct(vm.id, "hold");
    assert.deepEqual(Object.keys(state), ["draft:m3"], "Hold writes the draft's record, not the thread's");
  } finally {
    delete globalThis.window.__cancelSend;
  }
});

/* --------------------------------- the list --------------------------------- */

test("the buckets say which one is open, and the select-all box says what it selects", () => {
  const one = vmOf(chat(), asked());
  const two = vmOf(chat({ id: "c2" }), asked({ id: "e2" }));
  cells = [];
  frames.begin();
  const tree = InboxList({
    threads: [one, two],
    allThreads: [one, two],
    buckets: [
      { id: "escalated", label: "Needs you", icon: "flag", count: 2 },
      { id: "done", label: "Handled", icon: "check", count: 0 },
    ],
    views: [],
    activeBucket: "escalated",
    onBucketChange() {},
    activeThreadId: one.id,
    onSelectThread() {},
    selected: [],
    onToggleSelect() {},
    onClearSelection() {},
  });
  const bucket = (label) =>
    find(tree, (n) => n.type === "button" && hasClass("ix-bucket")(n) && textOf(n).includes(label));
  assert.deepEqual(
    [bucket("Needs you").props["aria-pressed"], bucket("Handled").props["aria-pressed"]],
    [true, false],
    "REGRESSION: nothing said which bucket was open but its colour",
  );
  const all = find(tree, (n) => n.type === "input" && n.props?.type === "checkbox" && !hasClass("ix-thread-check")(n));
  assert.equal(all.props["aria-label"], "Select all 2 conversations", "REGRESSION: its name was the count beside it");
});
