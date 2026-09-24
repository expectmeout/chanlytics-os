/**
 * The controls around the thread: its … menu, the line under its name, and the line that says what it needs from you.
 *
 * On 21 September the menu was 194px of 12.5px under an eyebrow in capitals, with "Receptionist for this person…"
 * broken onto two lines and a boxed … opening it. The line under the name spent itself on "+1 (917) 555-0114" and "no
 * name saved". The status line was a dot and a bold title here, an icon and a bold name inside a sentence there, a white
 * slab of a button beside a link with an arrow. Now: one menu, grouped by what it acts on; the wires the conversation is
 * on; and one anatomy for every state -- the pill its row in the list wears, a quiet word, one sentence, soft acts.
 *
 * Run against the page on a stub React, never read from it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toInboxThreadVM,
  stateOf,
  memberWords,
  dealMenuActs,
  DEAL_ACT_WORDS,
  NOTE_WORDS,
  nextStepOf,
  stepDayOf,
  zoneDayKey,
} from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const at = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

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
  __href: (route, p) => `${route}|${p.id}`,
  canDo: () => true,
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
const { InboxThread, MoreMenu } = globalThis.window;

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
const find = (tree, pred) => all(tree, pred)[0];
const hasClass = (c) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(c);
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};

const m = (id, min, over = {}) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Can I move my appointment to Friday?",
  media: null,
  meta: null,
  status: "received",
  channel: "whatsapp",
  created_at: at(min),
  channel_ts: at(min),
  ...over,
});
const conv = (over = {}) => ({
  id: "c1",
  state: "needs_human",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: at(40),
  last_message_at: at(40),
  contact: {
    id: "k1",
    display_name: "Rosa Díaz",
    wa_profile_name: null,
    phone_e164: "+13475550101",
    consent: "opted_in",
    dnc: false,
  },
  messages: [m("m1", 40)],
  ...over,
});
const asked = { id: "e1", reason: "human_token", details: null, state: "open", created_at: at(40) };
const labels = { whatsapp: "WhatsApp", phone: "Phone", sms: "Text", email: "Email" };
const draw = (vm, props = {}) => {
  cells = [];
  frames.begin();
  return InboxThread({ thread: vm, channelLabels: labels, onArchive: () => {}, ...props });
};

/* --------------------------------- the menu --------------------------------- */

test("the thread's menu: what to do with the conversation, then the person, then the file -- no eyebrow, nothing broken onto two lines", () => {
  const tree = draw(toInboxThreadVM(conv(), asked, ZONE, NOW));
  const menu = find(tree, (n) => n.type === MoreMenu);
  assert.ok(menu, "the thread has its menu");
  const shape = menu.props.items.map((it) => (it.divider ? "|" : it.header ? `[${it.header}]` : it.label));
  assert.deepEqual(shape, [
    "Snooze",
    "Archive",
    "|",
    "Open profile",
    "Receptionist settings",
    "|",
    "Export transcript",
  ]);
  assert.equal(
    menu.props.items.find((it) => it.label === "Snooze").hint,
    "until tomorrow 10:00",
    "what Snooze will do, set to its right",
  );
  assert.ok(menu.props.btnClass.split(" ").includes("btn-ghost"), "REGRESSION: a boxed … beside the name");
});

test("a group with nothing in it takes no divider with it", () => {
  // Snoozed (no Snooze), archived (no Archive), and nobody behind it (no profile): only the file is left.
  const tree = draw(
    toInboxThreadVM(
      conv({
        state: "archived",
        contact: {
          id: null,
          display_name: null,
          wa_profile_name: null,
          phone_e164: "+13475550101",
          consent: "opted_in",
          dnc: false,
        },
      }),
      null,
      ZONE,
      NOW,
    ),
    { onArchive: null },
  );
  const menu = find(tree, (n) => n.type === MoreMenu);
  const shape = menu.props.items.map((it) => (it.divider ? "|" : it.label));
  assert.ok(
    !shape.includes("Archive") && shape[0] !== "|" && shape.at(-1) !== "|",
    `no divider at an edge: ${shape.join(", ")}`,
  );
});

test("the menu draws a hint as one short word at the item's end, apart from the meta line", () => {
  cells = [];
  frames.begin();
  let tree = MoreMenu({
    items: [
      { label: "Snooze", hint: "until tomorrow 10:00", icon: "clock", onClick() {} },
      { label: "Find new ones", meta: "Only places not already in your leads count", onClick() {} },
    ],
  });
  find(tree, (n) => n.type === "button" && n.props["aria-haspopup"] === "menu").props.onClick({ stopPropagation() {} });
  frames.begin();
  tree = MoreMenu({
    items: [
      { label: "Snooze", hint: "until tomorrow 10:00", icon: "clock", onClick() {} },
      { label: "Find new ones", meta: "Only places not already in your leads count", onClick() {} },
    ],
  });
  const hint = find(tree, hasClass("more-item-hint"));
  assert.equal(textOf(hint), "until tomorrow 10:00");
  assert.equal(
    textOf(find(tree, hasClass("more-item-meta"))),
    "Only places not already in your leads count",
    "a long meta line is still its own line",
  );
});

/* ------------------------------ the line under the name ------------------------------ */

test("the line under the name says the wires the conversation is on, once -- never a number or 'no name saved'", () => {
  const head = (vm) => textOf(find(draw(vm), hasClass("ix-th-meta")));
  assert.equal(head(toInboxThreadVM(conv(), asked, ZONE, NOW)), "WhatsApp");
  const call = {
    id: "k1",
    direction: "inbound",
    sender: "ai",
    type: "call_summary",
    body: "Inbound call · 3 min — wants a bridal trial",
    media: null,
    meta: null,
    status: "received",
    channel: "voice",
    created_at: at(30),
    channel_ts: at(30),
  };
  assert.equal(
    head(toInboxThreadVM(conv({ messages: [m("m1", 40), call] }), asked, ZONE, NOW)),
    "WhatsApp · Phone",
    "both wires, the chat's first",
  );
  assert.ok(!/\+1|no name/.test(head(toInboxThreadVM(conv(), asked, ZONE, NOW))));
});

test("beside the wires, the person's next visit from People -- or their last -- as one quiet chip; nothing without one, and the wires' line is untouched", () => {
  // The header said only the channel; who this is (a visit ahead, a visit behind) was a page away on People. The
  // chip is People's own words (nextVisitDay, lastVisitDay), never a repeat of the band below the conversation.
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const chip = (tree) => find(tree, hasClass("ix-th-visit"));
  const person = (over) => ({ id: "k1", nextVisitDay: null, nextVisit: null, lastVisitDay: null, ...over });
  try {
    globalThis.window.__PEOPLE = {
      rows: [person({ nextVisitDay: "Tue, Sep 8", nextVisit: "Tue, Sep 8 · 2:00 – 5:00 PM · Balayage" })],
    };
    let tree = draw(vm);
    assert.equal(textOf(chip(tree)).trim(), "Tue, Sep 8 · 2:00 – 5:00 PM", "a visit ahead: its day and time");
    assert.ok(chip(tree).props.className.split(" ").includes("ahead"), "marked as ahead");
    assert.equal(textOf(find(tree, hasClass("ix-th-meta"))), "WhatsApp", "the wires' line says the wires, once");
    globalThis.window.__PEOPLE = { rows: [person({ lastVisitDay: "Thu, Aug 20" })] };
    tree = draw(vm);
    assert.equal(textOf(chip(tree)).trim(), "Last · Thu, Aug 20", "nothing ahead: the last visit, as People says it");
    assert.ok(!chip(tree).props.className.split(" ").includes("ahead"));
    globalThis.window.__PEOPLE = { rows: [person()] };
    assert.ok(!chip(draw(vm)), "no visit either way: no chip");
    globalThis.window.__PEOPLE = { rows: [person({ id: "somebody-else", nextVisitDay: "Tue, Sep 8" })] };
    assert.ok(!chip(draw(vm)), "another person's visit is not this one's");
  } finally {
    delete globalThis.window.__PEOPLE;
  }
  assert.ok(!chip(draw(vm)), "People not read yet: no chip");
  // Drawn before People landed, it listens for People (surface:clients) and draws the chip then.
  const heard = [];
  const keep = globalThis.window.addEventListener;
  globalThis.window.addEventListener = (type) => heard.push(type);
  try {
    draw(vm);
  } finally {
    globalThis.window.addEventListener = keep;
  }
  assert.ok(heard.includes("surface:clients"), "the header redraws when People lands");
});

test("REGRESSION: who the thread is with opens their page -- the face, the name and the line under it are one link; Actions › Open profile was the only way there", () => {
  const went = [];
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const link = find(draw(vm, { onOpenClient: (id) => went.push(id) }), byTestId("ix-th-person"));
  assert.ok(link, "a link to the person");
  assert.equal(link.type, "a");
  assert.equal(link.props.href, "#/clients/k1", "their page's address, so a long press or a new tab opens it too");
  assert.ok(
    find(link, hasClass("ix-th-avatar")) && find(link, hasClass("ix-th-name")) && find(link, hasClass("ix-th-meta")),
    "the face, the name and the wires' line are one door, a thumb tall",
  );
  assert.equal(textOf(find(link, hasClass("ix-th-name-words"))), "Rosa Díaz");
  let prevented = false;
  link.props.onClick({ button: 0, preventDefault: () => (prevented = true) });
  assert.deepEqual(went, ["k1"], "a press opens them the Inbox's own way");
  assert.ok(prevented, "the app navigates, not the browser");
  went.length = 0;
  link.props.onClick({ button: 0, metaKey: true, preventDefault: () => (prevented = false) });
  assert.deepEqual(went, [], "a new tab is the browser's");
  // Someone with no person behind them (a caller never added) has no page: the same block, not a link.
  const none = draw({ ...vm, clientId: null });
  assert.equal(find(none, byTestId("ix-th-person")), undefined);
  assert.ok(find(none, hasClass("ix-th-who")), "the face and the name stand as they did");
});

test("the header's menu says what it is -- Actions, with the chevron -- and stays a ghost beside the name", () => {
  // A ⋯ alone, in the dim ink, was too faint to find on a phone (Ruben, 22 Sep 2026). A word says it opens something.
  const menu = find(draw(toInboxThreadVM(conv(), asked, ZONE, NOW)), (n) => n.type === MoreMenu);
  assert.equal(menu.props.label, "Actions");
  assert.equal(menu.props.title, "Actions", "and its tooltip says the same word, not More");
  const cls = menu.props.btnClass.split(" ");
  assert.ok(
    cls.includes("btn-ghost") && cls.includes("ix-th-more") && !cls.includes("btn-icon"),
    "a ghost button with words, not a boxed icon",
  );
});

/* ------------------------------ what it needs from you ------------------------------ */

test("Needs you: the pill its row wears and how long they have waited, in the bar under the header; the reason's sentence and soft acts by the reply box -- no white slab", () => {
  const tree = draw(toInboxThreadVM(conv(), asked, ZONE, NOW));
  const standing = find(tree, byTestId("ix-th-standing"));
  assert.ok(
    find(standing, (n) => n.props?.kind === "thread" && n.props?.value === "escalated"),
    "the row's own pill, in the bar",
  );
  assert.equal(textOf(find(standing, hasClass("ix-th-standing-meta"))), "waiting 40m");
  const needs = find(tree, byTestId("ix-needs-you"));
  assert.ok(needs, "the state line");
  assert.equal(
    find(needs, (n) => n.props?.kind === "thread"),
    undefined,
    "REGRESSION: the pill said the state again by the reply box",
  );
  const acts = find(needs, hasClass("ix-state-acts"));
  const answer = find(acts, (n) => n.type === "button" && textOf(n).includes("I'll answer this"));
  assert.ok(answer, "the act that answers it");
  assert.ok(
    hasClass("ix-state-go")(answer) && !hasClass("btn-primary")(answer),
    "REGRESSION: a white slab beside the reply box's Send",
  );
  assert.ok(
    find(acts, (n) => n.type === "button" && textOf(n).trim() === "Hand back"),
    "and the way out",
  );
});

test("a teammate's thread wears the pill their row wears, in the bar, and offers nothing to take", () => {
  globalThis.window.__TEAM = [{ id: "u-ana", name: "Ana García" }];
  const later = new Date(NOW.getTime() + 3_600_000).toISOString();
  try {
    const tree = draw(
      toInboxThreadVM(
        conv({ paused_until: later, assignee_user_id: "u-ana", assignee_is_me: false }),
        asked,
        ZONE,
        NOW,
      ),
    );
    const pill = find(
      find(tree, byTestId("ix-th-standing")),
      (n) => n.props?.kind === "thread" && n.props?.value === "theirs",
    );
    assert.ok(pill, "the row's pill");
    const theirs = find(tree, byTestId("ix-theirs"));
    assert.ok(theirs, "and what it means, by the reply box");
    assert.equal(find(theirs, hasClass("ix-state-acts")), undefined, "nothing to take from them");
  } finally {
    globalThis.window.__TEAM = null;
  }
});

const quietConv = () =>
  conv({
    state: "open",
    messages: [
      m("m1", 30, { body: "Open Sunday?" }),
      m("m2", 29, { direction: "outbound", sender: "ai", body: "Closed Sundays.", status: "read" }),
    ],
  });

test("a quiet thread is one quiet sentence, in the bar under the header -- no pill, no acts, and nothing by the reply box", () => {
  const tree = draw(toInboxThreadVM(quietConv(), null, ZONE, NOW));
  const words = find(tree, hasClass("ix-th-standing-words"));
  assert.equal(textOf(words), "Answered by the receptionist — no one asked for you.");
  assert.ok(hasClass("ok")(words), "in the tone of what it says");
  assert.equal(find(tree, byTestId("ix-last-word")), undefined, "REGRESSION: the sentence sat by the reply box too");
  assert.equal(
    find(find(tree, byTestId("ix-th-status")), hasClass("ix-state")),
    undefined,
    "nothing left to say there",
  );
});

/* ------------------------------ where the conversation stands ------------------------------ */

// Two days since they last wrote: WhatsApp's window has closed, and only a template sends.
const DAY = 24 * 60;
const closedConv = (over = {}) =>
  conv({ last_wa_inbound_at: at(2 * DAY), last_message_at: at(2 * DAY), messages: [m("m1", 2 * DAY)], ...over });

test("the bar under the header says where the conversation stands and that the window has closed, once; the reply box is only the send that works", () => {
  globalThis.window.__TEMPLATES = [];
  try {
    const tree = draw(toInboxThreadVM(closedConv(), asked, ZONE, NOW));
    const bar = find(tree, byTestId("ix-th-bar"));
    assert.ok(bar, "the bar");
    // Under the header, over the conversation: a thread opens on it.
    const rows = tree.props.children
      .filter((k) => k && typeof k === "object")
      .map((k) => k.type?.name || k.props?.className || k.type);
    assert.deepEqual(rows.slice(0, 2), ["ThreadHeader", "ThreadBar"], `header, then the bar: ${rows.join(", ")}`);
    assert.match(textOf(find(bar, byTestId("ix-th-standing"))), /^Needs youwaiting 40m$/);
    assert.equal(textOf(find(bar, byTestId("ix-th-window"))), "Window closed");
    assert.equal(find(bar, byTestId("ix-th-window-why")), undefined, "why, not until it is asked");
    find(bar, (n) => n.type === "button" && textOf(n).trim() === "Why?").props.onClick();
    frames.begin();
    const opened = InboxThread({ thread: toInboxThreadVM(closedConv(), asked, ZONE, NOW), channelLabels: labels });
    assert.equal(
      textOf(find(opened, byTestId("ix-th-window-why"))),
      "The 24-hour WhatsApp window is closed — free-form replies can't be delivered. Approved templates only.",
    );
    // The reply box says none of it again: no red block, no "WhatsApp · to Rosa Díaz" under the header that names both.
    const box = find(opened, hasClass("ix-composer"));
    assert.equal(find(box, hasClass("ix-composer-banner")), undefined, "REGRESSION: the window's red block");
    assert.equal(
      find(box, hasClass("ix-composer-channel")),
      undefined,
      "REGRESSION: the wire and the name, said again",
    );
    assert.equal(textOf(opened).split("24-hour").length - 1, 1, "the window is said once, where it was asked for");
    assert.match(textOf(box), /^No approved template yet — nothing can be sent until one is\.$/);
  } finally {
    delete globalThis.window.__TEMPLATES;
  }
});

test("the window is the bar's only while it is WhatsApp's to say: open, a text, a caller with no chat, an opt-out", () => {
  const windowOf = (dto) => find(draw(toInboxThreadVM(dto, null, ZONE, NOW)), byTestId("ix-th-window"));
  assert.ok(windowOf(closedConv()), "closed");
  assert.equal(windowOf(conv()), undefined, "open: they wrote 40 minutes ago");
  assert.equal(
    windowOf(closedConv({ messages: [m("m1", 2 * DAY, { channel: "sms" })] })),
    undefined,
    "a text has no window",
  );
  assert.equal(
    windowOf(
      closedConv({
        last_wa_inbound_at: null,
        messages: [m("m1", 56, { type: "call_summary", sender: "system", body: "Inbound call · 3 min" })],
      }),
    ),
    undefined,
    "a caller with no chat",
  );
  assert.equal(
    windowOf(closedConv({ contact: { ...conv().contact, consent: "opted_out", dnc: true } })),
    undefined,
    "an opt-out is the reply box's to say: nothing can be sent at all",
  );
});

test("a reply that didn't send: the row's pill in the bar, and what it means by the reply box", () => {
  const failed = conv({
    state: "open",
    messages: [
      m("m1", 30, { body: "Can I book at 3?" }),
      m("m2", 29, { direction: "outbound", sender: "ai", body: "Booked!", status: "failed" }),
    ],
  });
  const tree = draw(toInboxThreadVM(failed, null, ZONE, NOW));
  const pill = find(find(tree, byTestId("ix-th-standing")), (n) => n.props?.kind === "tone");
  assert.ok(pill && pill.props.label === "Didn't send" && pill.props.value === "danger", "the pill its row wears");
  const word = find(tree, byTestId("ix-last-word"));
  assert.match(textOf(word), /They wrote last, and the reply from the receptionist didn't send/);
  assert.ok(hasClass("danger")(word));
});

test("a draft still waiting to go out is the thread's state: the bar says nothing over the countdown", () => {
  const draft = m("m3", 0.5, {
    direction: "outbound",
    sender: "ai",
    body: "Friday at 3 works.",
    status: "queued",
    meta: { delay_ms: 90_000 },
    channel_ts: null,
  });
  const tree = draw(toInboxThreadVM(conv({ state: "open", messages: [m("m1", 2), draft] }), null, ZONE, NOW), {
    veto: 72,
  });
  assert.equal(
    find(tree, byTestId("ix-th-standing")),
    undefined,
    "REGRESSION: 'no reply yet' over 'Auto-sends in 72s'",
  );
});

test("the chip beside the wires says the deal before the visit: a client, a proposal waiting, else the visit", () => {
  // People's row carries the deal (0004): its brief is the chip where it says more than a visit ahead -- a client,
  // a proposal waiting. A pass or an end has no brief, so the visit stands. One chip, never two.
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const rowWith = (person) => ({
    id: "k1",
    nextVisitDay: "Tue, Sep 8",
    nextVisit: "Tue, Sep 8 · 2:00 PM · Call",
    lastVisitDay: null,
    deal: null,
    ...person,
  });
  const drawWith = (row) => {
    globalThis.window.__PEOPLE = { rows: [row] };
    return draw(vm);
  };
  try {
    let tree = drawWith(rowWith({}));
    assert.equal(textOf(find(tree, byTestId("ix-th-visit"))).trim(), "Tue, Sep 8 · 2:00 PM");
    assert.equal(find(tree, byTestId("ix-th-deal")), undefined, "no deal: the visit alone");
    tree = drawWith(rowWith({ deal: { stage: "won", brief: "Client · Ad management" } }));
    assert.equal(textOf(find(tree, byTestId("ix-th-deal"))).trim(), "Client · Ad management");
    assert.ok(hasClass("ahead")(find(tree, byTestId("ix-th-deal"))), "a client is marked as a visit ahead is");
    assert.equal(find(tree, byTestId("ix-th-visit")), undefined, "one chip: the deal took the visit's place");
    tree = drawWith(rowWith({ deal: { stage: "proposed", brief: "Proposal out · 6 d" } }));
    assert.equal(textOf(find(tree, byTestId("ix-th-deal"))).trim(), "Proposal out · 6 d");
    assert.ok(!hasClass("ahead")(find(tree, byTestId("ix-th-deal"))), "a proposal waiting is quiet");
    tree = drawWith(rowWith({ deal: { stage: "lost", brief: null } }));
    assert.equal(
      textOf(find(tree, byTestId("ix-th-visit"))).trim(),
      "Tue, Sep 8 · 2:00 PM",
      "a pass says nothing here",
    );
    assert.equal(find(tree, byTestId("ix-th-deal")), undefined);
  } finally {
    delete globalThis.window.__PEOPLE;
  }
});

test("a step due under the head: what, and when it was due, with Done outside the link -- one ahead is not said; Done answers in a toast with Set the next one, and the line goes", async () => {
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  // The line judges the day against the real clock, as the page does.
  const now = Date.now();
  const day = (d) => zoneDayKey(now + d * 86_400_000, ZONE);
  const stepOf = (d, dealId = null) =>
    nextStepOf(
      { step_id: "s1", step_body: "Send the revised quote", step_due_on: day(d), step_deal_id: dealId },
      ZONE,
      now,
    );
  const pressed = [];
  let answer = { ok: true, data: { note: null } };
  let hold = null;
  const events = [];
  const sheets = [];
  const w = globalThis.window;
  const keep = { dispatchEvent: w.dispatchEvent, gate: w.gate };
  Object.assign(w, {
    __clock: { zone: () => ZONE },
    __personNotes: {
      dayOf: stepDayOf,
      words: NOTE_WORDS,
      done: async (...a) => {
        pressed.push(a);
        if (hold) await hold;
        return answer;
      },
    },
    openStepSheet: (a) => sheets.push(a),
    dispatchEvent: (e) => {
      events.push([e.type, e.detail]);
      return true;
    },
  });
  const redraw = () => {
    frames.begin();
    return InboxThread({ thread: vm, channelLabels: labels, onArchive: () => {} });
  };
  try {
    w.__PEOPLE = { rows: [{ id: "k1", deal: null, nextStep: stepOf(-2) }] };
    let tree = draw(vm);
    const line = find(tree, byTestId("ix-th-step"));
    assert.ok(line, "a step whose day has gone is said");
    assert.deepEqual(
      [
        textOf(find(line, hasClass("ix-th-step-label"))),
        textOf(find(line, byTestId("ix-th-step-words"))),
        textOf(find(line, byTestId("ix-th-step-when"))),
        textOf(find(line, byTestId("ix-th-step-done"))),
      ],
      [NOTE_WORDS.next, "Send the revised quote", stepDayOf(day(-2), ZONE, now).words, NOTE_WORDS.done],
    );
    assert.equal(line.props["data-due"], "past");
    assert.equal(
      find(find(tree, byTestId("ix-th-person")), byTestId("ix-th-step-done")),
      undefined,
      "Done is not inside the link to their page",
    );
    // A second press while the first is on its way waits for it: one reaches the door.
    let release;
    hold = new Promise((r) => (release = r));
    const done = find(tree, byTestId("ix-th-step-done")).props.onClick;
    const first = done();
    await done();
    release();
    await first;
    hold = null;
    assert.deepEqual(pressed, [["k1", "s1", true]]);
    assert.deepEqual(events.at(-1), ["note:saved", { personId: "k1" }], "the person's page and the peek hear it");
    tree = redraw();
    assert.equal(find(tree, byTestId("ix-th-step")), undefined, "done: the line goes before People is read again");
    assert.equal(textOf(find(tree, hasClass("pp-toast-msg"))), NOTE_WORDS.stepDone);
    const next = find(tree, (n) => hasClass("pp-toast-cta")(n) && textOf(n) === NOTE_WORDS.setTheNext);
    next.props.onClick();
    assert.deepEqual(sheets, [{ personId: "k1", dealId: null }], "Set the next one opens the one step sheet");
    // A refusal is said in the door's words, and the line stays.
    answer = { ok: false, message: "Only a note with a day can be done." };
    tree = draw(vm);
    await find(tree, byTestId("ix-th-step-done")).props.onClick();
    tree = redraw();
    assert.ok(find(tree, byTestId("ix-th-step")), "refused: the line stays");
    assert.equal(textOf(find(tree, hasClass("pp-toast-msg"))), "Only a note with a day can be done.");
    // One whose day is ahead waits for it; one today is said.
    w.__PEOPLE = { rows: [{ id: "k1", deal: null, nextStep: stepOf(3) }] };
    assert.equal(find(draw(vm), byTestId("ix-th-step")), undefined, "ahead: not said");
    w.__PEOPLE = { rows: [{ id: "k1", deal: null, nextStep: stepOf(0) }] };
    assert.equal(find(draw(vm), byTestId("ix-th-step")).props["data-due"], "today");
    // A viewer's Done refuses at the control, and says why: the gate's handlers are the button's.
    const refused = [];
    w.gate = (a) => (a === "approve" ? { "aria-disabled": true, onClick: () => refused.push(a) } : {});
    pressed.length = 0;
    find(draw(vm), byTestId("ix-th-step-done")).props.onClick();
    assert.deepEqual([refused, pressed], [["approve"], []]);
  } finally {
    Object.assign(w, keep);
    delete w.__PEOPLE;
    delete w.__personNotes;
    delete w.__clock;
    delete w.openStepSheet;
  }
});

test("Actions carry the deal's moves as a group of their own, by the stage of the deal People's row carries, each opening the one deal sheet; only where deals are on (0008)", () => {
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const itemsOf = (tree) => find(tree, (n) => n.type === MoreMenu).props.items;
  const shape = (tree) => itemsOf(tree).map((it) => (it.divider ? "|" : it.label));
  const was = { deal: globalThis.window.__deal, open: globalThis.window.openDealSheet };
  const opened = [];
  // What happens, in order: the Actions button taking focus, and the sheet asked for.
  const order = [];
  // The kit the courier publishes (people-detail.ts window.__deal), and the sheet's door (components/deal-sheet.jsx).
  globalThis.window.__deal = { menu: dealMenuActs, actWords: DEAL_ACT_WORDS };
  globalThis.window.openDealSheet = (ask) => {
    opened.push(ask);
    order.push("sheet");
    return true;
  };
  // The header's Actions button, as the page has it.
  const actions = { focus: () => order.push("actions") };
  globalThis.document.querySelector = (sel) => (sel === ".ix-th-head .ix-th-more" ? actions : null);
  const people = (deal, dealsOn = true) => {
    globalThis.window.__PEOPLE = { rows: [{ id: "k1", deal }], dealsOn };
  };
  const press = (label) =>
    itemsOf(draw(vm))
      .find((it) => it.label === label)
      .onClick();
  try {
    // No deal: a proposal to start, in a group of its own after the person's.
    people(null);
    assert.deepEqual(shape(draw(vm)), [
      "Snooze",
      "Archive",
      "|",
      "Open profile",
      "Receptionist settings",
      "|",
      "Start a proposal",
      "|",
      "Export transcript",
    ]);
    assert.equal(itemsOf(draw(vm)).find((it) => it.label === "Start a proposal").icon, "deal");
    press("Start a proposal");
    assert.deepEqual(
      opened.at(-1),
      { personId: "k1", mode: "propose", dealId: null },
      "the sheet, not the person's page",
    );
    // The sheet gives focus back to what held it as it opened, and the menu's item is gone by then: the Actions button
    // holds it first, so closing the sheet lands there. REGRESSION: focus fell to the page's body.
    assert.deepEqual(order, ["actions", "sheet"]);
    // A proposal out (with no link to send on People's row here): its moves, each on this deal.
    people({ id: "d1", stage: "proposed", proposal: null });
    assert.deepEqual(shape(draw(vm)).slice(6, 9), ["Mark as client", "Mark as passed", "Edit proposal"]);
    for (const [label, mode] of [
      ["Mark as client", "won"],
      ["Mark as passed", "lost"],
      ["Edit proposal", "edit"],
    ]) {
      order.length = 0;
      press(label);
      assert.deepEqual(opened.at(-1), { personId: "k1", mode, dealId: "d1" });
      assert.deepEqual(order, ["actions", "sheet"], label);
    }
    people({ id: "d1", stage: "won" });
    assert.deepEqual(shape(draw(vm)).slice(6, 7), ["End the engagement"]);
    press("End the engagement");
    assert.deepEqual(opened.at(-1), { personId: "k1", mode: "ended", dealId: "d1" });
    people({ id: "d1", stage: "lost" });
    press("Propose again");
    assert.deepEqual(opened.at(-1), { personId: "k1", mode: "again", dealId: "d1" });
    people({ id: "d1", stage: "ended" });
    press("Start a proposal");
    assert.deepEqual(
      opened.at(-1),
      { personId: "k1", mode: "propose", dealId: null },
      "an end is re-signed as a new row",
    );
    assert.ok(!shape(draw(vm)).includes("Record a deal…"), "REGRESSION: a door to the person's page, not the sheet");
    // Where customers book, and before People has read them, there is no group.
    people(null, false);
    assert.deepEqual(
      shape(draw(vm)).slice(-3),
      ["Receptionist settings", "|", "Export transcript"],
      "a salon never sees it",
    );
    delete globalThis.window.__PEOPLE;
    assert.ok(!shape(draw(vm)).includes("Start a proposal"), "People not read yet: nothing to say of a deal");
  } finally {
    delete globalThis.window.__PEOPLE;
    delete globalThis.document.querySelector;
    globalThis.window.__deal = was.deal;
    globalThis.window.openDealSheet = was.open;
  }
});

/* ------------------------------ it moves as one ------------------------------ */

test("a message that arrives while the thread is open rises into place; the ones it opened with are simply there", () => {
  const two = [m("m1", 40, { body: "Hi" }), m("m2", 38, { body: "Is Friday open?" })];
  const opened = draw(toInboxThreadVM(conv({ messages: two }), asked, ZONE, NOW));
  assert.equal(all(opened, hasClass("tl-arrived")).length, 0, "opening a thread animates none of it");
  // The same thread, drawn again with one more message, over the same hook state: as React draws it after a read.
  frames.begin();
  const more = InboxThread({
    thread: toInboxThreadVM(conv({ messages: [...two, m("m3", 1, { body: "Or Saturday?" })] }), asked, ZONE, NOW),
    channelLabels: labels,
    onArchive: () => {},
  });
  const risen = all(more, hasClass("tl-arrived"));
  assert.equal(risen.length, 1, "only the one that arrived");
  assert.equal(risen[0].props["data-mid"], "m3");
});

test("on a phone an open thread swipes back to its list: the pane carries a thumb's handlers when it has a Back", () => {
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const pane = (props) => find(draw(vm, props), hasClass("ix-thread-pane"));
  assert.equal(typeof pane({ onBack: () => {} }).props.onTouchMove, "function");
  assert.equal(pane({}).props.onTouchMove, undefined, "with no Back (a desktop's pane), nothing to swipe to");
});
