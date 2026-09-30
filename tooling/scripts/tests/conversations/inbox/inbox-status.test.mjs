/**
 * What a thread needs from you sits by the reply box, one state at a time.
 *
 * Measured 15 Sep 2026 in the harness (the real page code and CSS, threads built by toInboxThreadVM) at 375x812:
 * - Rosa's Needs-you banner was a red-outlined card 262px tall over her conversation, with a boxed quote inside it;
 *   her first message started at 427px and the reply box took 185px, so about one bubble fitted between them;
 * - the states stacked as cards at the top of the scroller and scrolled away with the words;
 * - a draft about to send read "They wrote last — no reply yet" over "Auto-sends in 72s".
 * Here, on a stub React: where the status sits, one state at a time, its one signal, and the demo left as it was.
 * How it looks is measured in the harness and by the nightly (thread.spec.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";
import { keysDrawn } from "../../_keys.mjs";

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
  channel: "whatsapp",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  created_at: ago(min),
  channel_ts: ago(min),
});
const ours = (id, body, min, status = "read") => ({
  id,
  direction: "outbound",
  sender: "ai",
  channel: "whatsapp",
  type: "text",
  body,
  media: null,
  meta: null,
  status,
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
  last_message_at: ago(39),
  contact: rosa,
  messages: [wrote("m1", "Can I move my appointment to Friday?", 40), ours("m2", "Let me check with the team.", 39)],
  ...over,
});
const asked = (min = 40) => ({ id: "e1", reason: "human_token", details: null, state: "open", created_at: ago(min) });
const draft = {
  id: "m3",
  direction: "outbound",
  sender: "ai",
  channel: "whatsapp",
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
  __chrome: { state: stateOf },
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
const { InboxThread } = globalThis.window;

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
const classOf = (n) =>
  typeof n?.props?.className === "string"
    ? n.props.className
    : typeof n?.rendered?.props?.className === "string"
      ? n.rendered.props.className
      : "";
const hasClass = (cls) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls);
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const paneOf = (thread, over = {}) => {
  cells = [];
  frames.begin();
  return InboxThread({ thread, channelLabels: { whatsapp: "WhatsApp", phone: "Phone", sms: "Text" }, ...over });
};
/** The pane's own rows, top to bottom, by the class each draws. */
const rowsOf = (pane) =>
  (pane.props.children || [])
    .filter((k) => k && typeof k === "object")
    .map((k) => classOf(k).split(" ")[0])
    .filter(Boolean);

/* --------------------------------- the pane --------------------------------- */

test("REGRESSION: on a real thread what it needs from you sits under the conversation, by the reply box -- it was a stack of cards over the timeline that took a phone's first screen and scrolled away with the words", () => {
  const pane = paneOf(vmOf(chat(), asked()));
  const rows = rowsOf(pane);
  const scroll = rows.indexOf("ix-th-scroll");
  const status = rows.indexOf("ix-th-status");
  const composer = rows.indexOf("ix-composer");
  assert.ok(scroll > -1 && status > -1 && composer > -1, `the pane's rows: ${rows.join(", ")}`);
  assert.ok(
    scroll < status && status < composer,
    `the conversation, then what it needs, then the reply box: ${rows.join(", ")}`,
  );
  const scroller = find(pane, hasClass("ix-th-scroll"));
  assert.ok(find(scroller, hasClass("ix-timeline")), "the conversation is in the scroller");
  for (const cls of ["ix-take", "ix-resolved", "ix-state", "ix-veto"])
    assert.equal(find(scroller, hasClass(cls)), undefined, `REGRESSION: ${cls} scrolled away with the words`);
  const take = find(find(pane, byTestId("ix-th-status")), byTestId("ix-needs-you"));
  assert.ok(take, "what Needs you asks is by the reply box");
  assert.match(textOf(take), /I'll answer this/);
  // Its name and its wait are the bar's, under the header (the thread state bar).
  const standing = find(pane, byTestId("ix-th-standing"));
  assert.match(textOf(standing), /Needs you/);
  assert.match(textOf(standing), /waiting 40m/);
  assert.ok(!textOf(take).includes("waiting 40m"), "said once");
});

test("every state of a real thread is named in the bar under the header, and what it asks is said by the reply box: yours, a teammate's, snoozed, archived, and who had the last word", () => {
  const states = {
    yours: [
      chat({ paused_until: later, assignee_user_id: "u-me", assignee_is_me: true }),
      asked(),
      /^You have it$/,
      /stays quiet while you have it/,
    ],
    theirs: [
      chat({ paused_until: later, assignee_user_id: "u-ana", assignee_is_me: false }),
      asked(),
      /has itwaiting 40m$/,
      /until they hand it back/,
    ],
    snoozed: [
      chat({ state: "snoozed", snooze_until: later, paused_until: later }),
      null,
      /^Snoozedback /,
      /Hidden from your queue/,
    ],
    archived: [chat({ state: "archived" }), null, /^Archived$/, /Their request is closed/],
    lastWord: [
      chat({ state: "open", messages: [wrote("m1", "Open Sunday?", 30), ours("m2", "Closed Sundays.", 29)] }),
      null,
      /^Answered by the receptionist — no one asked for you\.$/,
      /^$/,
    ],
  };
  for (const [name, [dto, esc, named, asks]] of Object.entries(states)) {
    const pane = paneOf(vmOf(dto, esc));
    assert.match(textOf(find(pane, byTestId("ix-th-standing"))), named, `${name}: named in the bar`);
    const status = find(pane, byTestId("ix-th-status"));
    assert.ok(status, `${name}: the status row`);
    assert.match(textOf(status), asks, `${name}: what it asks, by the reply box`);
    for (const cls of ["ix-resolved", "ix-state"])
      assert.equal(
        find(find(pane, hasClass("ix-th-scroll")), hasClass(cls)),
        undefined,
        `${name}: not over the conversation`,
      );
  }
});

test("REGRESSION: a draft waiting to go out is the thread's one state -- 'They wrote last — no reply yet' sat over 'Auto-sends in 72s'", () => {
  const vm = vmOf(chat({ state: "open", messages: [wrote("m1", "Can I move my appointment to Friday?", 2), draft] }));
  assert.equal(vm.lastWord.text, "They wrote last — no reply yet.", "the view model still knows who wrote last");
  const pane = paneOf(vm, { veto: 72 });
  const status = find(pane, byTestId("ix-th-status"));
  assert.match(textOf(find(status, hasClass("ix-veto"))), /Auto-sends in 72s/, "the countdown is by the reply box");
  assert.equal(
    find(pane, byTestId("ix-last-word")),
    undefined,
    "REGRESSION: 'no reply yet' over a reply about to send",
  );
  assert.ok(!textOf(status).includes("no reply yet"));
  assert.equal(find(pane, byTestId("ix-th-standing")), undefined, "and the bar under the header says nothing either");
});

test("Needs you has one signal: the pill its row wears, and its wait, amber past thirty minutes -- a red flag in a red-outlined card", () => {
  const signal = (min) => {
    const pane = paneOf(vmOf(chat(), asked(min)));
    const standing = find(pane, byTestId("ix-th-standing"));
    return {
      pill: !!find(standing, (n) => n.props?.kind === "thread" && n.props?.value === "escalated"),
      flag: !!find(pane, (n) => n.type === "Icon" && n.props?.name === "flag"),
      wait: find(standing, hasClass("ix-th-standing-meta")),
    };
  };
  const late = signal(40);
  assert.deepEqual([late.pill, late.flag], [true, false], "REGRESSION: a red flag");
  assert.equal(textOf(late.wait), "waiting 40m");
  assert.ok(late.wait.props.className.split(" ").includes("late"), "amber past thirty minutes");
  const soon = signal(12);
  assert.equal(textOf(soon.wait), "waiting 12m");
  assert.ok(!soon.wait.props.className.split(" ").includes("late"), "and not before");
});

/* ------------------------------ the conversation ------------------------------ */

test("REGRESSION: a run of messages says its time once, and who sent ours and what became of it on its last -- every bubble said 'WhatsApp · 4:24 PM' over it and 'by WhatsApp Receptionist · Read' under it", () => {
  const vm = vmOf(
    chat({
      state: "open",
      messages: [
        wrote("m1", "Hi, are you open today?", 6),
        ours("m2", "Hi Rosa! We are.", 4),
        ours("m3", "Want me to find you a time?", 4),
      ],
    }),
  );
  const bubbles = [];
  walk(paneOf(vm), (n) => {
    if (hasClass("tl-msg")(n)) bubbles.push(n);
  });
  assert.equal(bubbles.length, 3);
  const has = (b, cls) => !!find(b, hasClass(cls));
  assert.deepEqual(
    bubbles.map((b) => has(b, "tl-msg-meta")),
    [true, true, false],
    "the time once per run",
  );
  assert.deepEqual(
    bubbles.map((b) => has(b, "tl-msg-by")),
    [false, false, true],
    "who sent it, on the run's last",
  );
  assert.ok(!textOf(find(bubbles[0], hasClass("tl-msg-meta"))).includes("WhatsApp"), "one channel: the time alone");
});

test("words that did not reach them say so on their own bubble, whatever follows", () => {
  const vm = vmOf(
    chat({
      state: "open",
      messages: [wrote("m1", "Hi", 6), ours("m2", "Hello!", 4, "failed"), ours("m3", "Are you there?", 4)],
    }),
  );
  const bubbles = [];
  walk(paneOf(vm), (n) => {
    if (hasClass("tl-msg")(n)) bubbles.push(n);
  });
  assert.match(textOf(find(bubbles[1], hasClass("tl-msg-by"))), /Didn't send/);
});

test("REGRESSION: a real thread's reply box is one line with Send beside it, naming the channel it goes out on -- a three-line field over a line repeating the channel and the name", () => {
  cells = [];
  frames.begin();
  const box = globalThis.window.InboxComposer({ thread: vmOf(chat({ state: "open" })), reply: "", onSend() {} });
  assert.ok(box.props.className.split(" ").includes("ix-composer-row"));
  assert.equal(
    find(box, hasClass("ix-composer-foot")),
    undefined,
    "REGRESSION: a line saying 'WhatsApp · to Rosa Díaz' under the field",
  );
  const field = find(box, (n) => n.type === "textarea");
  assert.deepEqual(
    [field.props.rows, field.props.placeholder, field.props["aria-label"]],
    [1, "WhatsApp to Rosa Díaz…", "Reply to Rosa Díaz"],
  );
  assert.ok(find(box, hasClass("ix-composer-send")), "Send beside it");
});

test("REGRESSION: the reply box and a seeded approval draw no key -- Send said ⌘↵ and the card's foot A, D and E, beside the ? sheet that lists them", () => {
  cells = [];
  frames.begin();
  const box = globalThis.window.InboxComposer({ thread: vmOf(chat({ state: "open" })), reply: "", onSend() {} });
  assert.equal(textOf(find(box, hasClass("ix-composer-send"))), "Send");
  assert.deepEqual(keysDrawn(box), []);
  const seeded = {
    id: "t-seed",
    real: false,
    who: "Aisha",
    whoMeta: "",
    avatar: "A",
    state: "needs",
    confidence: 0.86,
    takenOver: false,
    claimedByOther: false,
    agent: { name: "Aria", glyph: "A", autonomy: "Asks first" },
    timeline: [],
    channels: ["sms"],
    primaryChannel: "sms",
    priority: "P2",
  };
  assert.deepEqual(keysDrawn(paneOf(seeded)), [], "the demo's reply box");
  const chanly = globalThis.window.CHANLY;
  globalThis.window.CHANLY = { ...chanly, fmtDelta: (n) => `$${n}`, confTone: () => "safe" };
  try {
    const pane = paneOf({
      ...seeded,
      approval: {
        kind: "Reschedule",
        summary: "Move Friday to Saturday",
        recommended: "Approve",
        suggestedReply: "Saturday at 11 works. Shall I book it?",
        plan: {
          label: "Friday to Saturday",
          oneLine: "Same stylist, nobody waits",
          dollarDelta: 0,
          ltv: 0,
          confidence: 0.86,
        },
        fallback: "Keeps Friday",
        evidence: [],
        alternatives: [],
        nextSteps: [],
      },
    });
    const foot = find(pane, hasClass("ix-approval-foot"));
    assert.ok(foot, "the card is drawn");
    assert.equal(find(foot, hasClass("ix-approval-shortcuts")), undefined, "the card's line of keys");
    assert.deepEqual(keysDrawn(pane), []);
  } finally {
    globalThis.window.CHANLY = chanly;
  }
});

test("the demo keeps its cards over its story, with no status row", () => {
  const seeded = {
    id: "t-seed",
    real: false,
    who: "Aisha",
    whoMeta: "",
    avatar: "A",
    state: "escalated",
    takenOver: false,
    claimedByOther: false,
    agent: { name: "Aria", glyph: "A" },
    timeline: [],
    channels: ["sms"],
    primaryChannel: "sms",
    priority: "P2",
  };
  const pane = paneOf(seeded);
  assert.equal(find(pane, byTestId("ix-th-status")), undefined);
  const take = find(find(pane, hasClass("ix-th-scroll")), hasClass("ix-take"));
  assert.ok(take, "its banner is where it was");
  assert.ok(
    find(take, (n) => n.type === "Icon" && n.props?.name === "flag"),
    "with its flag",
  );
});
