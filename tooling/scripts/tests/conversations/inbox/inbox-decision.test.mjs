/**
 * The Inbox at the moment of deciding: what a thread tells you before you press anything.
 *
 * Four things were said wrong on a real workspace (the wiring audit's L1, A6, A10 and A24):
 * - the wait chip counted in raw minutes -- "waiting 10869m" on a thread the context strip
 *   called 8d, seen on every waiting thread at the salon;
 * - a thread a teammate is answering still read "Needs you", kept its unread dot, and offered
 *   "I'll answer this", which takes it from them without a word, beside a hand-back that
 *   resolves their request;
 * - beside "I'll answer this" sat the reason's sentence and none of the customer's words; a
 *   call back promised "the details say what they wanted" and showed none;
 * - the auto-send countdown's tip said Edit cancels the draft, where on a real thread Edit
 *   only opens the composer and the draft keeps counting.
 * Run against the contracts that decide it, and the pages drawn on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

const ANA = "u-ana";
const TEAM = [{ userId: ANA, email: "ana@marisas.example.com", displayName: "Ana García" }];
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
const conv = (over = {}) => ({
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
};
const callback = asked({
  reason: "callback",
  details: "Call Rosa back to confirm the bridal trial on Oct 3",
  created_at: ago(55),
});

/* ------------------------------- the view model ------------------------------- */

test("a thread a teammate is answering is theirs: not Needs you, no unread dot, and the claim carries whose it is", () => {
  const theirs = toInboxThreadVM(conv({ assignee_user_id: ANA, assignee_is_me: false }), asked(), ZONE, NOW);
  assert.equal(theirs.claimedByOther, true);
  assert.equal(theirs.assigneeUserId, ANA);
  assert.equal(theirs.needsYou, false);
  assert.equal(theirs.unread, false, "REGRESSION: it kept the dot that means a person is needed and nobody has it");
  assert.equal(theirs.summary, "A teammate is answering this. The receptionist stays quiet until they hand it back.");
  assert.equal(
    theirs.subject,
    "Customer asked for a person",
    "the reason stays on its row, and the pill says whose it is: the row said 'A teammate is answering this'",
  );

  const open = toInboxThreadVM(conv(), asked(), ZONE, NOW);
  assert.deepEqual([open.claimedByOther, open.assigneeUserId, open.needsYou, open.unread], [false, null, true, true]);
  const mine = toInboxThreadVM(conv({ assignee_user_id: "u-me", assignee_is_me: true }), asked(), ZONE, NOW);
  assert.deepEqual([mine.claimedByOther, mine.takenOver, mine.unread], [false, true, false]);
});

test("the customer's own words ride with the decision: what they last wrote, quoted; what the call left, as noted; nothing when nothing is being decided", () => {
  assert.deepEqual(toInboxThreadVM(conv(), asked(), ZONE, NOW).ask, {
    kind: "wrote",
    label: "They wrote",
    text: "Can I move my appointment to Friday?",
    quoted: true,
  });
  const later = conv({
    messages: [
      wrote("m1", "Can I move my appointment to Friday?", 40),
      wrote("m2", "Or Saturday morning works too", 5),
    ],
  });
  assert.equal(
    toInboxThreadVM(later, asked(), ZONE, NOW).ask.text,
    "Or Saturday morning works too",
    "the last thing they said, which is what they are waiting on",
  );
  const call = toInboxThreadVM(conv({ last_wa_inbound_at: null, messages: [callNote] }), callback, ZONE, NOW);
  // "call": the band says it as its sentence (the call is above it), so it is not said again beneath (calls you can follow).
  assert.deepEqual(call.ask, {
    kind: "call",
    label: "From the call",
    text: "Call Rosa back to confirm the bridal trial on Oct 3",
    quoted: false,
  });
  assert.equal(toInboxThreadVM(conv(), null, ZONE, NOW).ask, null, "no decision, nothing to put beside one");
});

/* ------------------------------ the pages, drawn ------------------------------ */

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
globalThis.document = {
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }),
};
globalThis.window = {
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of [
  "StatePill",
  "MoreMenu",
  "EmptyState",
  "PolicyChip",
  "TlMedia",
  "FailedRead",
  "usePPToast",
  "useHotkey",
])
  globalThis[k] = globalThis.window[k];
await import("../../../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
await import("../../../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
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
    if (n.type === "button") out.push(textOf(n));
  });
  return out;
};

const listOf = (threads) => {
  cells = [];
  frames.begin();
  return InboxList({
    threads,
    allThreads: threads,
    buckets: [{ id: "escalated", label: "Needs you", count: threads.length }],
    views: [],
    activeBucket: "escalated",
    onBucketChange() {},
    activeThreadId: null,
    onSelectThread() {},
    selected: [],
    onToggleSelect() {},
    onClearSelection() {},
  });
};
const rowOf = (tree, who) => find(tree, (n) => hasClass("ix-thread")(n) && textOf(n).includes(who));
const paneOf = (thread) => {
  cells = [];
  frames.begin();
  return InboxThread({ thread, channelLabels: { whatsapp: "WhatsApp", phone: "Phone" } });
};

test("the list: a wait reads as days, and a teammate's thread says whose it is instead of Needs you", () => {
  globalThis.window.__TEAM = TEAM;
  const waiting = toInboxThreadVM(conv(), asked({ created_at: ago(10_869) }), ZONE, NOW);
  const nina = { ...rosa, id: "p2", display_name: "Nina Park" };
  const theirs = toInboxThreadVM(
    conv({ id: "c2", contact: nina, assignee_user_id: ANA, assignee_is_me: false }),
    asked({ id: "e2", created_at: ago(90) }),
    ZONE,
    NOW,
  );
  const tree = listOf([waiting, theirs]);

  const rosaRow = rowOf(tree, "Rosa Díaz");
  const wait = find(rosaRow, hasClass("ix-wait"));
  assert.equal(textOf(wait), "waiting 8d", "REGRESSION: it read waiting 10869m");
  assert.ok(wait.props.className.includes("warn"), "past thirty minutes the wait is amber");
  assert.equal(
    find(rosaRow, byTestId("thread-state")),
    undefined,
    "in its own bucket a thread that needs you is not told so again: the chip counts it (I2)",
  );
  assert.ok(hasClass("unread")(rosaRow));

  const ninaRow = rowOf(tree, "Nina Park");
  assert.equal(find(ninaRow, byTestId("thread-state")), undefined, "REGRESSION: a teammate's thread said Needs you");
  assert.equal(textOf(find(ninaRow, byTestId("thread-theirs"))), "Ana García has it");
  assert.ok(!hasClass("unread")(ninaRow), "and carries no unread dot");
  const ninaWait = find(ninaRow, hasClass("ix-wait"));
  assert.ok(ninaWait && !ninaWait.props.className.includes("warn"), "its wait is not amber: it is not waiting on you");

  globalThis.window.__TEAM = null;
  assert.equal(
    textOf(find(rowOf(listOf([theirs]), "Nina Park"), byTestId("thread-theirs"))),
    "A teammate has it",
    "the roster unread, or the person gone from it: no name is invented",
  );
});

test("the pane: a teammate's thread names who is answering, and offers no take-over and no hand-back", () => {
  globalThis.window.__TEAM = TEAM;
  const tree = paneOf(toInboxThreadVM(conv({ assignee_user_id: ANA, assignee_is_me: false }), asked(), ZONE, NOW));
  const banner = find(tree, byTestId("ix-theirs"));
  assert.ok(banner, "the claim is said where the take banner was");
  // The pill their row in the list wears, in the same words, in the bar under the header: "Ana García is answering
  // this" was a sentence of its own.
  assert.match(textOf(find(tree, byTestId("ix-th-standing"))), /Ana García has it/);
  assert.match(
    textOf(banner),
    /If you reply, the thread becomes yours\./,
    "a reply claims it, so the page says so before it happens",
  );
  const buttons = buttonsOf(tree);
  assert.ok(
    !buttons.some((b) => b.includes("I'll answer this")),
    "REGRESSION: 'I'll answer this' took it from them without a word",
  );
  assert.ok(
    !buttons.some((b) => b.includes("hand it back")),
    "REGRESSION: the hand-back resolved the teammate's request",
  );
  assert.equal(find(tree, hasClass("ix-take")), undefined, "no Needs you banner on a thread someone has");
  globalThis.window.__TEAM = null;
});

test("the pane: beside I'll answer this, the customer's own words -- what they wrote, or what the call left", () => {
  const take = find(paneOf(toInboxThreadVM(conv(), asked(), ZONE, NOW)), byTestId("ix-needs-you"));
  assert.ok(take, "the take banner");
  const words = find(take, byTestId("ix-take-ask"));
  assert.ok(words, "REGRESSION: only the reason's sentence sat beside the decision");
  assert.equal(textOf(words), "They wrote“Can I move my appointment to Friday?”");
  assert.ok(
    buttonsOf(take).some((b) => b.includes("I'll answer this")),
    "the decision is still there to make",
  );

  // A call back's details are the line's own sentence, said once: "From the call" beneath the same words went (calls you
  // can follow), and the call itself is right above.
  const callTake = find(
    paneOf(toInboxThreadVM(conv({ last_wa_inbound_at: null, messages: [callNote] }), callback, ZONE, NOW)),
    byTestId("ix-needs-you"),
  );
  assert.equal(
    textOf(find(callTake, hasClass("ix-state-says"))),
    "Call Rosa back to confirm the bridal trial on Oct 3",
    "REGRESSION: the call back promised the details and showed none",
  );
  assert.equal(find(callTake, byTestId("ix-take-ask")), undefined, "and not again beneath them");
});

test("the countdown's tip says what stops a real draft -- Hold, or starting to type -- where Edit only opens the composer", () => {
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
  const vm = toInboxThreadVM(
    conv({ state: "open", messages: [wrote("m1", "Can I move my appointment to Friday?", 2), draft] }),
    null,
    ZONE,
    NOW,
  );
  assert.ok(vm.veto, "a draft counting down to send");
  const msg = find(paneOf(vm), hasClass("ix-veto-msg"));
  assert.equal(
    msg.props["data-tip"],
    "This draft sends itself at zero. Hold stops it, and so does starting to type a reply.",
  );
});
