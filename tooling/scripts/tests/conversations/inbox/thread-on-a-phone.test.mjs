/**
 * The thread as a phone draws it (design/the-thread-is-a-phone-screen).
 *
 * Measured on app.chanlytics.com at 375x812: the meta line under a reply — "by WhatsApp
 * Receptionist · Booking · 91% sure · Read" — was four spans in an inline-flex, so it wrapped as
 * UNITS into a ragged three-column block with orphaned separators. The time over the bubble was
 * printed again beside the author, forty pixels below. A booking URL took five lines of a bubble
 * and could not be tapped. An email's quoted chain was drawn in full, so two words of reply filled
 * the screen. Why the receptionist said it lived in a title attribute, which a touch screen has no
 * way to open.
 *
 * Run against the page on a stub React, never read from it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const at = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

const msg = (over = {}) => ({
  id: "m1",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Do you have Friday?",
  media: null,
  meta: null,
  status: "received",
  channel: "whatsapp",
  created_at: at(60),
  channel_ts: at(60),
  ...over,
});
const ours = (over = {}) =>
  msg({
    id: "m2",
    direction: "outbound",
    sender: "ai",
    body: "Yes, 3pm works.",
    status: "read",
    created_at: at(59),
    channel_ts: at(59),
    ...over,
  });
const conv = (messages, over = {}) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: at(60),
  last_message_at: at(59),
  contact: {
    id: "k1",
    display_name: "Rosa Díaz",
    wa_profile_name: null,
    phone_e164: "+13475550101",
    consent: "opted_in",
    dnc: false,
  },
  messages,
  ...over,
});

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
  __WORKSPACES: [{ id: "t1", slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: {
    nav() {},
    R: { client: (id) => `clients/${id}`, thread: (id) => `inbox/${id}` },
    IX_NOW: "12:04",
    CONF: { SAFE: 0.8, MED: 0.5 },
  },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  __href: (_route, p) => `/api/v1/messages/${p.id}/media?workspace=marisas`,
  gate: () => ({}),
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
  useMemo: (fn) => fn(),
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
const all = (tree, pred) => {
  const hits = [];
  walk(tree, (n) => {
    if (pred(n)) hits.push(n);
  });
  return hits;
};
const one = (tree, pred) => all(tree, pred)[0];
const byClass = (c) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(c);
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const draw = (dto, escalation = null) => {
  cells = [];
  frames.begin();
  return InboxThread({
    thread: toInboxThreadVM(dto, escalation, ZONE, NOW),
    channelLabels: { whatsapp: "WhatsApp", phone: "Phone", email: "Email" },
  });
};
// Draw again with the cells kept, so a disclosure that was toggled is drawn open.
const redraw = (dto, escalation = null) => {
  frames.begin();
  return InboxThread({
    thread: toInboxThreadVM(dto, escalation, ZONE, NOW),
    channelLabels: { whatsapp: "WhatsApp", phone: "Phone", email: "Email" },
  });
};

/* ---------------------------------- a link ---------------------------------- */

const BOOKSY = "https://book.example.com/en-us/4471902_marisa-s-beauty-salon_hair-salon_29902_brooklyn";

test("an address in a message is a link, and the whole of it stays in the DOM to be copied", () => {
  const tree = draw(conv([msg(), ours({ body: `Book any time: ${BOOKSY}` })]));
  const link = one(tree, byClass("tl-msg-link"));
  assert.ok(link, "REGRESSION: the address was plain text — five wrapped lines, and not tappable");
  assert.equal(link.props.href, BOOKSY, "the href is the whole address");
  assert.equal(textOf(link), BOOKSY, "so is the text: it is clipped by CSS, never by cutting the string");
  assert.equal(link.props.rel, "noopener noreferrer nofollow");
  assert.ok(textOf(tree).includes("Book any time: "), "the words around it are still the customer's");
});

test("a message with no address renders no link at all", () => {
  assert.equal(one(draw(conv([msg()])), byClass("tl-msg-link")), undefined);
});

/* -------------------------------- the quote -------------------------------- */

const QUOTED = "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM Foo <a@b.com> wrote: > testing back at you >";

test("an email's quoted chain is behind a tap, and the bubble says what they wrote", () => {
  const dto = conv([msg({ channel: "email", body: QUOTED })]);
  const shut = draw(dto);
  assert.ok(textOf(shut).includes("Got it, thanks!"));
  assert.ok(!textOf(shut).includes("testing back at you"), "REGRESSION: the chain filled the bubble");
  const toggle = one(shut, byTestId("tl-msg-quote-toggle"));
  assert.ok(toggle, "there is a way to see it");
  assert.equal(textOf(toggle), "Show quoted text");

  toggle.props.onClick();
  const open = redraw(dto);
  assert.ok(textOf(open).includes("testing back at you"), "the chain is kept, and opens");
  assert.equal(textOf(one(open, byTestId("tl-msg-quote-toggle"))), "Hide quoted text");
});

test("a WhatsApp message that reads like a quote is not one", () => {
  const tree = draw(conv([msg({ channel: "whatsapp", body: QUOTED })]));
  assert.ok(textOf(tree).includes("testing back at you"), "every character is theirs");
  assert.equal(one(tree, byTestId("tl-msg-quote-toggle")), undefined);
});

/* ---------------------------- the line under a reply ---------------------------- */

// The shape the wire actually stores, which replyWhy() reads: an intent, a confidence, the facts
// it leaned on and the reason. (Written as { reply_why: … } the first time, this test passed
// without ever finding the button.)
const WHY_META = {
  intent: "booking",
  confidence: 0.91,
  facts_used: ["Hours", "Price list"],
  reason: "She asked for a time we had open.",
};

test("why it said that is a button a thumb can open, not a title only a mouse can hover", () => {
  const dto = conv([msg(), ours({ meta: WHY_META })]);
  const shut = draw(dto);
  const why = one(shut, byTestId("tl-msg-why"));
  assert.ok(why, "the reply remembers why, so the thread offers it");
  assert.equal(textOf(why), "· Booking · 91% sureWhy", "both labels ship; the breakpoint picks one");
  assert.equal(why.props.type, "button");
  assert.equal(why.props["aria-expanded"], false);
  assert.equal(one(shut, byTestId("tl-msg-why-panel")), undefined, "shut until asked");

  why.props.onClick();
  const open = redraw(dto);
  const panel = one(open, byTestId("tl-msg-why-panel"));
  assert.ok(panel, "the reason opens on a tap");
  assert.ok(textOf(panel).includes("She asked for a time we had open."), "with the reason the title used to hide");
  assert.ok(textOf(panel).includes("Hours"), "and the facts it used");
});

test("the author line says who and what became of it, and never repeats the time above the bubble", () => {
  const tree = draw(conv([msg(), ours({ sender: "human", body: "See you Friday!", status: "read" })]));
  const by = one(tree, byClass("tl-msg-by"));
  assert.ok(by, "a reply of ours says who sent it");
  const line = textOf(by);
  assert.ok(/by your team/.test(line), `the author: ${line}`);
  assert.ok(one(tree, byClass("tl-msg-author")), "and it is the span that gives way when the line is short");

  // The bubble's own meta carries the time; the author line carried it a second time.
  const stamp = textOf(one(tree, byClass("tl-msg-meta")));
  assert.ok(stamp.trim().length > 0, `the time is over the bubble: ${stamp}`);
  assert.ok(!line.includes(stamp.trim()), `REGRESSION: printed twice — meta ${stamp.trim()}, author line ${line}`);
});
