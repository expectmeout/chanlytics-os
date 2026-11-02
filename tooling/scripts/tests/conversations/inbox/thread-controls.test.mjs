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
import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  toInboxThreadVM,
  stateOf,
  memberWords,
  dealMenuActs,
  DEAL_ACT_WORDS,
  NOTE_WORDS,
  dueStepDay,
  nextStepOf,
  stepDayOf,
  zoneDayKey,
} from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, unmount, quiet, redrawWanted } from "../../_legacy-react.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const at = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

const timers = { setTimeout, clearTimeout, setInterval, clearInterval };
installLegacyReact({
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
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
after(() => Object.assign(globalThis, timers));
// The shell's own helpers the pane spreads and calls (gate, touchSwipe, the toast, canDo), as the app publishes them.
(await import("../../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
const S = "../../../../../apps/dashboard/src/surfaces";
const { InboxThread } = await import(`${S}/inbox/thread/thread.tsx`);
const { MoreMenu } = await import(`${S}/kit/more-menu/more-menu.tsx`);
const { Menu } = await import(`${S}/kit/menu/menu.tsx`);
// The kit's menu as the thread reads it: its items in one list, a "|" between two groups and a group's heading in [].
const itemsIn = (menu) => menu.props.groups.flatMap((g) => g.items);
const menuShape = (menu) =>
  menu.props.groups.flatMap((g, i) => [
    ...(i ? ["|"] : []),
    ...(g.header ? [`[${g.header}]`] : []),
    ...g.items.map((it) => it.label),
  ]);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
/**
 * People's rows as the thread's head reads them: People's surface (want-person.ts personOnThread), read at a clock as People
 * publishes it. The head read the window's copy (`__PEOPLE`) until the Inbox load review (28 Oct 2026).
 */
const peopleAre = (value) => setSurfaceValue("people", value && { fetchedAt: Date.now(), ...value });
// The seam's own signal, on the module the header hears it from: a surface's rows landed.
const { surfaceMoved: surfaceLanded } =
  await import("../../../../../apps/dashboard/src/legacy-bridge/surface-status.ts");
after(() => setSurfaceValue("inbox", undefined));

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
// A new tree each time: the one before it goes away, as React unmounts it, and its effects are let go.
const draw = (vm, props = {}) => {
  unmount();
  fresh();
  return InboxThread({ thread: vm, channelLabels: labels, onArchive: () => {}, ...props });
};

/* --------------------------------- the menu --------------------------------- */

test("the thread's menu: the conversation, then the person by their first name, then the file, each under its heading -- nothing broken onto two lines", () => {
  const tree = draw(toInboxThreadVM(conv(), asked, ZONE, NOW));
  const menu = find(tree, (n) => n.type === Menu);
  assert.ok(menu, "the thread has its menu");
  const shape = menuShape(menu);
  assert.deepEqual(shape, [
    // Who it is about, at the sheet's head, their page a press away (the thread canvas, 1 Nov 2026).
    "Rosa Díaz",
    "|",
    "[This conversation]",
    // Taking it before a word is written, which the dock offered beside a Send that already answers and takes it.
    "I'll answer this",
    "Snooze",
    "Archive",
    // The reader's own mark on the person (00349): on a real thread it is kept, so the menu offers it again.
    "Mark as unread",
    "|",
    "[Rosa]",
    "Receptionist for Rosa",
    "|",
    "[Deal and file]",
    "Export transcript",
  ]);
  const head = itemsIn(menu)[0];
  assert.ok(head.hint && textOf(head.hint).includes("Profile"), "their page, named at the row's end");
  // On a phone the menu is the kit's sheet, its first row who it is about, their face and their page a press away.
  assert.equal(menu.props.head, undefined, "the row is its head: a title over it said the name twice");
  assert.equal(itemsIn(menu)[0].label, "Rosa Díaz");
  const take = itemsIn(menu).find((it) => it.label === "I'll answer this");
  assert.equal(take.meta, "The receptionist pauses, and your team sees you have it", "what taking it does");
  const taken = [];
  itemsIn(
    find(
      draw(toInboxThreadVM(conv(), asked, ZONE, NOW), { onTakeOver: (id) => taken.push(id) }),
      (n) => n.type === Menu,
    ),
  )
    .find((it) => it.label === "I'll answer this")
    .onSelect();
  assert.deepEqual(taken, ["th-c1"], "it takes the thread");
  assert.equal(menu.props.label, "More for the conversation with Rosa Díaz");
  assert.equal(
    itemsIn(menu).find((it) => it.label === "Snooze").meta,
    "Until tomorrow, 10:00 AM",
    "what Snooze will do, on its second line",
  );
  // A round of its own at the head's right, on the inset's ground (the thread canvas): a boxed … stood beside the name.
  assert.equal(menu.props.trigger.props.variant, "soft");
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
  const menu = find(tree, (n) => n.type === Menu);
  const shape = menuShape(menu);
  assert.ok(!shape.includes("Mark as unread"), "nobody behind the thread: there is no one to mark");
  assert.ok(
    !shape.includes("Archive") && shape[0] !== "|" && shape.at(-1) !== "|",
    `no divider at an edge: ${shape.join(", ")}`,
  );
});

test("the menu draws a hint as one short word at the item's end, apart from the meta line", () => {
  fresh();
  let tree = MoreMenu({
    items: [
      { label: "Snooze", hint: "until tomorrow 10:00", icon: "clock", onClick() {} },
      { label: "Find new ones", meta: "Only places not already in your leads count", onClick() {} },
    ],
  });
  find(tree, (n) => n.type === "button" && n.props["aria-haspopup"] === "menu").props.onClick({ stopPropagation() {} });
  tree = again(() =>
    MoreMenu({
      items: [
        { label: "Snooze", hint: "until tomorrow 10:00", icon: "clock", onClick() {} },
        { label: "Find new ones", meta: "Only places not already in your leads count", onClick() {} },
      ],
    }),
  );
  const hint = find(tree, hasClass("more-item-hint"));
  assert.equal(textOf(hint), "until tomorrow 10:00");
  assert.equal(
    textOf(find(tree, hasClass("more-item-meta"))),
    "Only places not already in your leads count",
    "a long meta line is still its own line",
  );
});

/* ------------------------------ the line under the name ------------------------------ */

test("the wires the conversation is on are glyphs after the name, said once in words to a reader -- never a number or 'no name saved'", () => {
  // The line under the name says where the thread stands; it said "Email" in words, beside a subject cut short (the
  // thread canvas, 1 Nov 2026). The wires are glyphs after the name, their words for a pointer and a screen reader.
  const wire = (vm) => find(draw(vm), byTestId("ix-th-wire"));
  const head = (vm) => wire(vm).props["aria-label"];
  assert.equal(head(toInboxThreadVM(conv(), asked, ZONE, NOW)), "WhatsApp");
  assert.equal(wire(toInboxThreadVM(conv(), asked, ZONE, NOW)).props.role, "img");
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
  // On the face's corner, the wire the thread is on (the thread canvas, 1 Nov 2026): the chat's glyph, both in words.
  assert.deepEqual(
    all(wire(toInboxThreadVM(conv({ messages: [m("m1", 40), call] }), asked, ZONE, NOW)), (n) => n.props?.name).map(
      (n) => n.props.name,
    ),
    ["chat"],
    "one glyph, the chat's",
  );
  assert.ok(!/\+1|no name/.test(head(toInboxThreadVM(conv(), asked, ZONE, NOW))));
  // Beside where it stands, the wire in a glyph and its word, for a desk whose rail drops the face (inbox.css .ix-th-on).
  const quietVm = toInboxThreadVM(conv({ state: "open" }), null, ZONE, NOW);
  assert.equal(textOf(find(draw(quietVm), byTestId("ix-th-on"))), "·WhatsApp");
});

/** A visit as People's row carries it (contracts visitLineOf): the chip draws its day, its time and how it stands. */
const visitLine = (day, time, state = null) => ({
  id: "v1",
  mark: null,
  title: "Balayage",
  day,
  time,
  person: null,
  state,
  unmarked: false,
  match: null,
  guess: false,
  acts: [],
  asks: [],
  to: null,
});
const PAST = { text: "Past", tone: "past", pill: "plain" };

test("after where it stands, the one fact People's row says of them: the next visit, else the last and how it went; nothing without one, nor another person's", () => {
  // The header said only the channel; who this is (a visit ahead, a visit behind) was a page away on People. Now the line
  // under the name says one fact of their row after where the thread stands (the thread canvas, 1 Nov 2026: "Needs you
  // 2h · Northwind Media"), never a repeat of the band below the conversation.
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const fact = (tree) => find(tree, byTestId("ix-th-fact"));
  const factOf = (tree) => textOf(find(fact(tree), hasClass("ix-th-fact-words")));
  const person = (over) => ({ id: "k1", nextVisitLine: null, lastVisitLine: null, ...over });
  try {
    peopleAre({
      rows: [person({ nextVisitLine: visitLine("Tue, Sep 8", "2:00 – 5:00 PM") })],
    });
    let tree = draw(vm);
    assert.equal(factOf(tree), "Next appointment Tue, Sep 8 2:00 – 5:00 PM", "a visit ahead: its day and time");
    const sub = find(tree, byTestId("ix-th-sub"));
    assert.match(
      textOf(find(sub, byTestId("ix-th-standing"))),
      /^Needs you/,
      "the line says where it stands, then the fact",
    );
    assert.ok(find(sub, byTestId("ix-th-fact")), "in the same line");
    peopleAre({
      rows: [person({ lastVisitLine: visitLine("Thu, Aug 20", "10:00 AM – 12:00 PM", PAST) })],
    });
    assert.equal(
      factOf(draw(vm)),
      "Last appointment Thu, Aug 20",
      "nothing ahead: the last visit, ended with nobody saying what became of it",
    );
    peopleAre({
      rows: [
        person({
          lastVisitLine: visitLine("Thu, Aug 20", "10:00 AM – 12:00 PM", { text: "Kept", tone: "kept", pill: "ok" }),
        }),
      ],
    });
    assert.equal(factOf(draw(vm)), "Appointment kept Thu, Aug 20", "a member's word on it");
    peopleAre({ rows: [person()] });
    assert.equal(fact(draw(vm)), undefined, "no visit either way, and nothing else known: no fact");
    peopleAre({
      rows: [person({ id: "somebody-else", nextVisitLine: visitLine("Tue, Sep 8", "2:00 – 5:00 PM") })],
    });
    assert.equal(fact(draw(vm)), undefined, "another person's visit is not this one's");
  } finally {
    peopleAre(undefined);
  }
  assert.equal(fact(draw(vm)), undefined, "People not read yet: no fact");
  // Drawn before People landed, it hears People's surface, so it is drawn again and shows the fact then.
  draw(vm);
  quiet();
  surfaceLanded("people");
  assert.ok(redrawWanted(), "the header redraws when People lands");
});

test("where they work is a door to the business's sheet beside the head on a desk, and words in the head on a phone; none for a stand-in or a business removed (0052)", () => {
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const person = (over) => ({
    id: "k1",
    nextVisitLine: null,
    lastVisitLine: null,
    standIn: false,
    worksAt: { leadId: "l1", name: "Bloom & Vow Bridal", gone: false },
    ...over,
  });
  try {
    peopleAre({ rows: [person()] });
    let tree = draw(vm);
    const door = find(tree, byTestId("ix-th-works-door"));
    assert.ok(door, "the door to the sheet");
    assert.match(textOf(door), /Works at\s+Bloom & Vow Bridal/);
    const head = find(tree, byTestId("ix-th-person"));
    if (head) assert.equal(find(head, byTestId("ix-th-works-door")), undefined, "beside the link to their page");
    // On a phone the line under the name says it, as its one fact where no deal or visit is known (the thread canvas,
    // 1 Nov 2026: "Needs you 2h · Northwind Media"); a desk hides that line's fact, so it is said once beside the head.
    assert.equal(textOf(find(find(tree, byTestId("ix-th-fact")), hasClass("ix-th-fact-words"))), "Bloom & Vow Bridal");
    // A stand-in's name is the business's already; a business removed has no sheet, and no name to say.
    peopleAre({ rows: [person({ standIn: true })] });
    tree = draw(vm);
    assert.equal(find(tree, byTestId("ix-th-works-door")), undefined);
    assert.equal(find(tree, byTestId("ix-th-fact")), undefined, "a stand-in's business is their name");
    peopleAre({ rows: [person({ worksAt: { leadId: "l1", name: null, gone: true } })] });
    tree = draw(vm);
    assert.equal(find(tree, byTestId("ix-th-works-door")), undefined);
    assert.equal(find(tree, byTestId("ix-th-fact")), undefined);
  } finally {
    peopleAre(undefined);
  }
});

test("REGRESSION: who the thread is with opens their page -- the face, the name and the line under it are one link; Actions › Open profile was the only way there", () => {
  const went = [];
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const link = find(draw(vm, { onOpenClient: (id) => went.push(id) }), byTestId("ix-th-person"));
  assert.ok(link, "a link to the person");
  assert.equal(link.type, "a");
  assert.equal(link.props.href, "#/clients/k1", "their page's address, so a long press or a new tab opens it too");
  assert.ok(
    find(link, hasClass("face")) && find(link, hasClass("ix-th-name")) && find(link, byTestId("ix-th-sub")),
    "the face, the name and the line under it are one door, a thumb tall",
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
  // Nothing in the door is a press of its own: a button inside a link is not one.
  assert.equal(
    find(link, (n) => n.type === "button"),
    undefined,
    "no press inside the door",
  );
});

test("the header's menu is More: a glyph on an inset round a thumb finds, its name said to a pointer and a screen reader", () => {
  // "Actions" and its chevron took a third of the header on a phone, beside a name cut short (the thread canvas, 1 Nov
  // 2026). The ⋯ that was too faint to find (Ruben, 22 Sep 2026) was the dim ink on nothing; this one stands on an inset
  // round (inbox.css .ix-th-more), 44px under a thumb.
  const trigger = find(draw(toInboxThreadVM(conv(), asked, ZONE, NOW)), (n) => n.type === Menu).props.trigger;
  assert.ok(trigger.props.iconOnly && trigger.props.className === "ix-th-more", "a glyph alone, on its round");
  assert.equal(trigger.props.title, "More");
  assert.equal(trigger.props["aria-label"], "More for the conversation with Rosa Díaz", "what it opens, to a reader");
  assert.ok(
    find(trigger, (n) => n.props?.name === "more"),
    "the glyph",
  );
  assert.equal(textOf(trigger).trim(), "", "no word beside it");
});

/* ------------------------------ what it needs from you ------------------------------ */

test("Needs you: the pill its row wears and how long they have waited, under the name; the reason's one line, its why a press away, and Hand back by the reply box whose Send is the answer -- no white slab", () => {
  const tree = draw(toInboxThreadVM(conv(), asked, ZONE, NOW));
  const standing = find(tree, byTestId("ix-th-standing"));
  // Lit in the coral with the wait beside it in the mono face (the thread canvas, 1 Nov 2026).
  const pill = find(standing, (n) => n.props?.kind === "tone" && n.props?.label === "Needs you");
  assert.ok(pill, "Needs you, under the name");
  assert.deepEqual([pill.props.value, pill.props.lit], ["accent", true]);
  assert.equal(textOf(find(standing, hasClass("ix-th-standing-meta"))), "40m");
  const needs = find(tree, byTestId("ix-needs-you"));
  assert.ok(needs, "the dock over the reply box (the phone canvas, B1)");
  assert.equal(
    find(needs, (n) => n.props?.kind === "thread"),
    undefined,
    "REGRESSION: the pill said the state again by the reply box",
  );
  // One line of what is owed (the thread canvas, 1 Nov 2026): it was the reason's sentence, up to forty words.
  assert.ok(
    textOf(find(needs, hasClass("notice-fact"))).startsWith("They asked for a person — a holding message went out"),
    textOf(needs),
  );
  const why = find(needs, (n) => n.type === "button" && hasClass("ix-why")(n));
  assert.ok(why, "the whole of it a press away");
  assert.equal(find(needs, byTestId("ix-hold-why")), undefined, "not until it is asked");
  const acts = find(needs, hasClass("notice-acts"));
  // The reply box's Send is the answer, and takes the thread (core reply: takeControl, resolveEscalation): a take-over
  // beside it was a second way to say the same thing.
  assert.equal(
    find(acts, (n) => n.type === "button" && textOf(n).includes("I'll answer this")),
    undefined,
    "REGRESSION: a take-over beside the Send that already answers",
  );
  const hand = find(acts, (n) => n.type === "button" && textOf(n).trim() === "Hand back");
  assert.ok(hand, "the way out");
  assert.ok(!hasClass("btn-primary")(hand), "REGRESSION: a white slab beside the reply box's Send");
  // Where nothing can be sent from the box, taking it is the act.
  const stopped = draw(
    toInboxThreadVM(conv({ contact: { ...conv().contact, consent: "opted_out", dnc: true } }), asked, ZONE, NOW),
  );
  assert.ok(
    find(find(stopped, byTestId("ix-needs-you")), (n) => n.type === "button" && textOf(n).includes("I'll answer this")),
    "no reply can go: take it",
  );
});

test("a teammate's thread wears the pill their row wears, in the bar, and offers nothing to take -- the reply box says what a reply does", () => {
  globalThis.window.__TEAM = [{ userId: "u-ana", email: "ana@example.com", displayName: "Ana García" }];
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
    assert.equal(pill.props.label, "Ana García has it", "by their name, from the roster");
    assert.equal(find(tree, hasClass("notice")), undefined, "nothing to take from them, and no block saying so");
    assert.equal(
      find(tree, (n) => n.type === "textarea" && hasClass("ix-composer-text")(n)).props.placeholder,
      "Reply to take it from Ana García…",
      "what it means, where a reply is written",
    );
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

test("a quiet thread, answered and owed nothing, says nothing: no bar under the header, and nothing by the reply box", () => {
  // "Answered by the receptionist — no one asked for you." stood over every thread in the ordinary state; who had the
  // last word is the conversation's own last bubble (the phone canvas, A1).
  const tree = draw(toInboxThreadVM(quietConv(), null, ZONE, NOW));
  assert.equal(find(tree, byTestId("ix-th-bar")), undefined, "no bar");
  assert.equal(find(tree, byTestId("ix-last-word")), undefined, "REGRESSION: the sentence sat by the reply box too");
  assert.equal(find(find(tree, byTestId("ix-th-status")), hasClass("notice")), undefined, "nothing left to say there");
});

/* ------------------------------ where the conversation stands ------------------------------ */

// Two days since they last wrote: WhatsApp's window has closed, and only a template sends.
const DAY = 24 * 60;
const closedConv = (over = {}) =>
  conv({ last_wa_inbound_at: at(2 * DAY), last_message_at: at(2 * DAY), messages: [m("m1", 2 * DAY)], ...over });

test("the line under the name says where the conversation stands; the template box says the window has closed, once, and is the send that works", () => {
  setSurfaceValue("inbox", {
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    THREADS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: { doneThisWeek: 0 },
    templates: [],
  });
  try {
    const tree = draw(toInboxThreadVM(closedConv(), asked, ZONE, NOW));
    assert.equal(find(tree, byTestId("ix-th-bar")), undefined, "no bar of its own under the header");
    // Under the name, in the header a thread opens on (the thread canvas, 1 Nov 2026).
    const sub = find(tree, byTestId("ix-th-sub"));
    assert.match(textOf(find(sub, byTestId("ix-th-standing"))), /^Needs you40m$/);
    assert.equal(find(sub, byTestId("ix-th-window")), undefined, "the person's door holds no press");
    // One line at the head of the template box, a lock, what is owed and the clause after it, and Why? (the thread
    // canvas, 1 Nov 2026): a dot in the warning's amber, "Window closed" and an underlined "Why?" made a bar 64px.
    const bar = find(tree, byTestId("ix-th-closed"));
    assert.ok(bar, "the box's head");
    assert.equal(
      textOf(find(bar, hasClass("ix-closed-words"))),
      "Chat window closed — only an approved template can reach Rosa now.",
    );
    const shut = find(bar, (n) => n.type === "button" && byTestId("ix-th-window-toggle")(n));
    assert.equal(textOf(shut).trim(), "Why?");
    assert.equal(shut.props["aria-expanded"], false);
    assert.equal(find(bar, byTestId("ix-th-window-why")), undefined, "why, not until it is asked");
    shut.props.onClick();
    const opened = again(() =>
      InboxThread({ thread: toInboxThreadVM(closedConv(), asked, ZONE, NOW), channelLabels: labels }),
    );
    assert.equal(
      textOf(find(opened, byTestId("ix-th-window-why"))),
      "A day after their last message, WhatsApp delivers only an approved message. Sending one reopens the chat.",
    );
    // The reply box says none of it again: no red block, no "WhatsApp · to Rosa Díaz" under the header that names both.
    const box = find(opened, hasClass("ix-composer"));
    assert.equal(find(box, hasClass("ix-composer-banner")), undefined, "REGRESSION: the window's red block");
    assert.equal(
      find(box, hasClass("ix-composer-channel")),
      undefined,
      "REGRESSION: the wire and the name, said again",
    );
    assert.equal(
      textOf(opened).split("delivers only an approved message").length - 1,
      1,
      "the window is said once, where it was asked for",
    );
    assert.match(textOf(box), /^No approved template yet — nothing can be sent until one is\.$/);
  } finally {
    setSurfaceValue("inbox", undefined);
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

test("a reply that didn't send: the row's pill in the bar, and what it means on its own bubble, with Send again", () => {
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
  // When they were written, beside it (the phone canvas, A1): an older one says its day, as the row's time does.
  const meta = (dto) =>
    textOf(
      find(
        find(draw(toInboxThreadVM(dto, null, ZONE, NOW)), byTestId("ix-th-standing")),
        hasClass("ix-th-standing-meta"),
      ),
    );
  assert.match(meta(failed), /^\d{1,2}:\d{2} [AP]M$/, "today: the time");
  const lastWeek = conv({
    state: "open",
    messages: [
      m("m1", 6 * DAY, { body: "Can I book at 3?" }),
      m("m2", 6 * DAY - 1, { direction: "outbound", sender: "ai", body: "Booked!", status: "failed" }),
    ],
  });
  assert.doesNotMatch(meta(lastWeek), /[AP]M$/, "days ago: the day, not a time that reads as today");
  // What it means is said on the bubble that did not leave, with the way to send it again; a sentence by the reply box
  // said it a third time.
  assert.equal(find(tree, byTestId("ix-last-word")), undefined);
  assert.equal(find(find(tree, byTestId("ix-th-status")), hasClass("notice")), undefined);
  const bubble = find(tree, (n) => hasClass("tl-msg")(n) && textOf(n).includes("Booked!"));
  assert.ok(find(bubble, (n) => n.props?.role === "img" && n.props?.["aria-label"] === "Didn't send"));
  assert.ok(find(bubble, byTestId("tl-again-send")) && find(bubble, byTestId("tl-again-edit")));
});

test("a draft still waiting to go out is the thread's state: the head says when it sends, never 'no reply yet'", () => {
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
  // "Sends in 1:12" lit in the amber (the thread canvas, 1 Nov 2026): it said "no reply yet" over "Auto-sends in 72s".
  const standing = find(tree, byTestId("ix-th-standing"));
  assert.equal(textOf(standing), "Sends in 1:12");
  assert.equal(find(standing, (n) => n.props?.kind === "tone").props.value, "warn");
  assert.ok(!textOf(tree).includes("no reply yet"), "REGRESSION: 'no reply yet' over 'Auto-sends in 72s'");
});

test("the fact under the name says the deal before the visit: a client, a proposal waiting, else the visit", () => {
  // People's row carries the deal (0004): its brief is the fact where it says more than a visit ahead -- a client, a
  // proposal waiting. A pass or an end has no brief, so the visit stands. One fact, never two.
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const rowWith = (person) => ({
    id: "k1",
    nextVisitLine: visitLine("Tue, Sep 8", "2:00 PM"),
    lastVisitLine: null,
    deal: null,
    ...person,
  });
  const factWith = (row) => {
    peopleAre({ rows: [row] });
    const tree = draw(vm);
    // (A part drawn inside another is walked twice, as its child and as what it drew: one element is one fact.)
    assert.equal(new Set(all(tree, byTestId("ix-th-fact"))).size, 1, "one fact");
    return textOf(find(find(tree, byTestId("ix-th-fact")), hasClass("ix-th-fact-words")));
  };
  try {
    assert.equal(factWith(rowWith({})), "Next appointment Tue, Sep 8 2:00 PM", "no deal: the visit alone");
    assert.equal(
      factWith(rowWith({ deal: { stage: "won", brief: "Client · Ad management" } })),
      "Client · Ad management",
    );
    assert.equal(factWith(rowWith({ deal: { stage: "proposed", brief: "Proposal out · 6 d" } })), "Proposal out · 6 d");
    assert.equal(
      factWith(rowWith({ deal: { stage: "lost", brief: null } })),
      "Next appointment Tue, Sep 8 2:00 PM",
      "a pass says nothing here",
    );
  } finally {
    peopleAre(undefined);
  }
});

test("REGRESSION (S9-7): their visit is a door to the visit beside the head on a desk -- under the name it opened the person, as the head does", () => {
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const door = (tree) => find(tree, byTestId("ix-th-visit-door"));
  const said = (tree) => find(find(tree, byTestId("ix-th-fact")), hasClass("ix-th-fact-words"));
  const withVisit = (to) => {
    peopleAre({
      rows: [
        { id: "k1", nextVisitLine: { ...visitLine("Tue, Sep 8", "2:00 PM"), to }, lastVisitLine: null, deal: null },
      ],
    });
    return draw(vm);
  };
  try {
    let tree = withVisit("calendar/visit:v1");
    assert.equal(door(tree).type, "a", "a link: a long press or a new tab opens the visit too");
    assert.ok(door(tree).props.href.endsWith("calendar/visit:v1"), door(tree).props.href);
    assert.equal(typeof door(tree).props.onClick, "function");
    assert.equal(textOf(door(tree)).trim(), "Tue, Sep 8 · 2:00 PM", "the visit's own words");
    assert.ok(hasClass("ahead")(door(tree)));
    // Its tip says the workspace's word for one (visitWordHere), never "visit" written in.
    assert.equal(door(tree).props.title, "Open their appointment");
    // The fact under the name says it for a phone, whose head has no room beside it; a desk hides it, so it is said once.
    assert.equal(textOf(said(tree)), "Next appointment Tue, Sep 8 2:00 PM", "the words under the name are the phone's");
    // A visit with no page of its own (a line People could not tie to a visit) is words alone, wherever it is drawn.
    tree = withVisit(null);
    assert.equal(door(tree), undefined, "no visit to open: no door");
    assert.equal(
      textOf(said(tree)),
      "Next appointment Tue, Sep 8 2:00 PM",
      "and the words under the name, on a desk too",
    );
    // A demo's thread has no visit to open.
    globalThis.window.__DEMO_MODE = true;
    assert.equal(door(withVisit("calendar/visit:v1")), undefined, "a demo opens no visit");
  } finally {
    peopleAre(undefined);
    globalThis.window.__DEMO_MODE = false;
  }
});

test("a step due under the head: what, and when it was due, with Done outside the link -- one ahead is not said; Done answers in a toast that says the step, with Undo, and the line goes", async () => {
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
  // The surfaces read again (legacy-verbs refreshSurface, through the runner's door).
  const readAgain = [];
  const w = globalThis.window;
  const keep = { dispatchEvent: w.dispatchEvent, gate: w.gate, __refreshSurface: w.__refreshSurface };
  Object.assign(w, {
    __refreshSurface: (key) => {
      readAgain.push(key);
      return Promise.resolve();
    },
    __clock: { zone: () => ZONE },
    __personNotes: {
      dayOf: stepDayOf,
      dueDay: dueStepDay,
      words: NOTE_WORDS,
      done: async (...a) => {
        pressed.push(a);
        if (hold) await hold;
        return answer;
      },
    },
    dispatchEvent: (e) => {
      events.push([e.type, e.detail]);
      return true;
    },
  });
  const redraw = () => again(() => InboxThread({ thread: vm, channelLabels: labels, onArchive: () => {} }));
  try {
    peopleAre({ rows: [{ id: "k1", deal: null, nextStep: stepOf(-2) }] });
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
      find(line, byTestId("ix-th-step-done")).props["aria-label"],
      NOTE_WORDS.markDone("Send the revised quote"),
      "a screen reader hears which step it marks done, in a header that holds more",
    );
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
    // A done the door took says nothing of its own (0047): People is read behind the write, and the person's page and the peek follow.
    const aboutThePerson = () => events.filter(([type]) => type === "note:saved" || type === "surface:clients");
    assert.deepEqual(
      aboutThePerson(),
      [],
      "REGRESSION: a done said note:saved, a second carrier of what the refresh and the feed tell",
    );
    tree = redraw();
    assert.equal(find(tree, byTestId("ix-th-step")), undefined, "done: the line goes before People is read again");
    const said = `${NOTE_WORDS.stepDone} · Send the revised quote`;
    assert.equal(textOf(find(tree, hasClass("pp-toast-msg"))), said, "the toast says which step");
    // People read again, the step gone from their row: the line's component goes, and the toast stays with the head.
    peopleAre({ rows: [{ id: "k1", deal: null, nextStep: null }] });
    tree = redraw();
    assert.equal(
      textOf(find(tree, hasClass("pp-toast-msg"))),
      said,
      "REGRESSION: the toast went with the line, a People read after it opened",
    );
    // Undo is the same door, open again; the toast offers nothing else.
    const ctas = all(tree, hasClass("pp-toast-cta")).map(textOf);
    assert.deepEqual(ctas, [NOTE_WORDS.undo], "Undo, and no Set the next one");
    find(tree, (n) => hasClass("pp-toast-cta")(n) && textOf(n) === NOTE_WORDS.undo).props.onClick();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.deepEqual(pressed, [
      ["k1", "s1", true],
      ["k1", "s1", false],
    ]);
    // A refusal is said in the door's words, and the line stays.
    peopleAre({ rows: [{ id: "k1", deal: null, nextStep: stepOf(-2) }] });
    answer = { ok: false, message: "Only a note with a day can be done." };
    tree = draw(vm);
    await find(tree, byTestId("ix-th-step-done")).props.onClick();
    tree = redraw();
    assert.ok(find(tree, byTestId("ix-th-step")), "refused: the line stays");
    assert.equal(textOf(find(tree, hasClass("pp-toast-msg"))), "Only a note with a day can be done.");
    // Nothing was written, so nothing is read behind it on its own, and the step the header holds may be the one a teammate
    // moved: it is People's row, so People is read again (S9-10). The event alone repainted the same rows.
    assert.deepEqual(readAgain, ["people"], "a refused done reads People again");
    assert.deepEqual(aboutThePerson(), [], "and says nothing of its own beside the read");
    // One whose day is ahead waits for it; one today is said.
    peopleAre({ rows: [{ id: "k1", deal: null, nextStep: stepOf(3) }] });
    assert.equal(find(draw(vm), byTestId("ix-th-step")), undefined, "ahead: not said");
    // Judged when People's rows were published, as every page judges a step: read three days ago, a step due two
    // days ago was a day ahead, and the head says what Today and People's Steps due say.
    peopleAre({ rows: [{ id: "k1", deal: null, nextStep: stepOf(-2) }], fetchedAt: now - 3 * 86_400_000 });
    assert.equal(find(draw(vm), byTestId("ix-th-step")), undefined, "one clock: People's");
    // A step for a teammate says whose it is.
    const maria = nextStepOf(
      {
        step_id: "s2",
        step_body: "Call about the timeline",
        step_due_on: day(-1),
        step_for_user_id: "u-maria",
        step_for_name: "Maria",
      },
      ZONE,
      now,
    );
    peopleAre({ rows: [{ id: "k1", deal: null, nextStep: maria }] });
    assert.equal(textOf(find(draw(vm), byTestId("ix-th-step-for"))), "For Maria");
    peopleAre({ rows: [{ id: "k1", deal: null, nextStep: stepOf(0) }] });
    assert.equal(find(draw(vm), byTestId("ix-th-step")).props["data-due"], "today");
    // A viewer's Done refuses at the control, and says why: the gate's handlers are the button's.
    const refused = [];
    w.gate = (a) => (a === "approve" ? { "aria-disabled": true, onClick: () => refused.push(a) } : {});
    pressed.length = 0;
    find(draw(vm), byTestId("ix-th-step-done")).props.onClick();
    assert.deepEqual([refused, pressed], [["approve"], []]);
  } finally {
    Object.assign(w, keep);
    peopleAre(undefined);
    delete w.__personNotes;
    delete w.__clock;
    delete w.openStepSheet;
  }
});

test("Actions carry the deal's moves as a group of their own, by the stage of the deal People's row carries, each opening the one deal sheet; in every workspace (0008, amended 18 Oct 2026)", () => {
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const itemsOf = (tree) => itemsIn(find(tree, (n) => n.type === Menu));
  const shape = (tree) => menuShape(find(tree, (n) => n.type === Menu));
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
  // The header's More button, as the page has it.
  const actions = { focus: () => order.push("actions") };
  globalThis.document.querySelector = (sel) => (sel === ".ix-th-head .ix-th-more" ? actions : null);
  const people = (deal) => {
    peopleAre({ rows: [{ id: "k1", deal }] });
  };
  const press = (label) =>
    itemsOf(draw(vm))
      .find((it) => it.label === label)
      .onSelect();
  try {
    // No deal: a proposal to start, at the head of the deal's and the file's group after the person's (the thread
    // canvas, 1 Nov 2026).
    people(null);
    assert.deepEqual(shape(draw(vm)), [
      "Rosa Díaz",
      "|",
      "[This conversation]",
      "I'll answer this",
      "Snooze",
      "Archive",
      "Mark as unread",
      "|",
      "[Rosa]",
      "Receptionist for Rosa",
      "|",
      "[Deal and file]",
      "Start a proposal",
      "Export transcript",
    ]);
    assert.equal(itemsOf(draw(vm)).find((it) => it.label === "Start a proposal").glyph.props.name, "deal");
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
    assert.deepEqual(shape(draw(vm)).slice(12, 15), ["Mark as client", "Mark as passed", "Edit proposal"]);
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
    assert.deepEqual(shape(draw(vm)).slice(12, 13), ["End the engagement"]);
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
    // Before People has read them, there is no group: their deal is not known yet.
    peopleAre(undefined);
    assert.ok(!shape(draw(vm)).includes("Start a proposal"), "People not read yet: nothing to say of a deal");
  } finally {
    peopleAre(undefined);
    delete globalThis.document.querySelector;
    globalThis.window.__deal = was.deal;
    globalThis.window.openDealSheet = was.open;
  }
});

test("an owner reading a person's email thread may say they are not a person from its Actions: their page opens with the question asked, the typed name and all (decision 0080); not on another wire, nor for a member who may not", async () => {
  const email = toInboxThreadVM(
    conv({
      contact: {
        id: "k9",
        display_name: "Fixture Host",
        wa_profile_name: null,
        phone_e164: null,
        email: "team@host.example",
        consent: "unknown",
        dnc: false,
      },
      messages: [m("m1", 40, { channel: "email", body: "A deployment failed." })],
    }),
    asked,
    ZONE,
    NOW,
  );
  const was = { may: globalThis.window.mayAtLeast, store: globalThis.sessionStorage };
  const kept = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => kept.set(k, String(v)),
    removeItem: (k) => kept.delete(k),
  };
  const opened = [];
  const itemsOf = (vm) => itemsIn(find(draw(vm, { onOpenClient: (id) => opened.push(id) }), (n) => n.type === Menu));
  try {
    globalThis.window.mayAtLeast = (rung) => rung === "owner";
    const item = itemsOf(email).find((it) => it.label === "Not a customer…");
    assert.ok(item, "offered beside the person's other acts");
    assert.equal(item.tone, "danger");
    item.onSelect();
    assert.deepEqual(opened, ["k9"], "their page, where Delete person asks its typed name");
    assert.deepEqual([...kept.values()], ["k9"], "the question carried to it");
    // Their page takes it as it is drawn, once: a second visit asks nothing.
    const { takeCarriedNotAPerson } = await import(`${S}/inbox/carried-reply.ts`);
    assert.equal(takeCarriedNotAPerson("k1"), false, "another person's page takes nothing");
    assert.equal(takeCarriedNotAPerson("k9"), true);
    assert.equal(takeCarriedNotAPerson("k9"), false);
    assert.ok(
      !itemsOf(toInboxThreadVM(conv(), asked, ZONE, NOW)).some((it) => it.label === "Not a customer…"),
      "a WhatsApp thread: not a mail sender",
    );
    globalThis.window.mayAtLeast = () => false;
    assert.ok(!itemsOf(email).some((it) => it.label === "Not a customer…"), "only an owner deletes a person");
  } finally {
    globalThis.window.mayAtLeast = was.may;
    globalThis.sessionStorage = was.store;
  }
});

test("an owner's first email from someone asks under the conversation whether it is a person writing, with the same act -- never for someone the business already serves, a member who may not, or another wire", () => {
  // The thread canvas, 1 Nov 2026: a sales sequence's email waited in Needs you, and the one act that fit was the fourth
  // item of the header's menu. Made-up values.
  const contact = {
    id: "k9",
    display_name: "Maya Chen",
    wa_profile_name: null,
    phone_e164: null,
    email: "maya@northwind.example",
    consent: "unknown",
    dnc: false,
  };
  const email = () =>
    toInboxThreadVM(
      conv({ contact, messages: [m("m1", 40, { channel: "email", body: "Would 15 minutes next week be useful?" })] }),
      { ...asked, reason: "email_review" },
      ZONE,
      NOW,
    );
  const row = (over = {}) => ({ id: "k9", threads: 1, deal: null, nextVisitLine: null, lastVisitLine: null, ...over });
  const was = { may: globalThis.window.mayAtLeast, store: globalThis.sessionStorage };
  const kept = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => kept.set(k, String(v)),
    removeItem: (k) => kept.delete(k),
  };
  const opened = [];
  const ask = (vm) => find(draw(vm, { onOpenClient: (id) => opened.push(id) }), byTestId("ix-first-email"));
  try {
    globalThis.window.mayAtLeast = (rung) => rung === "owner";
    peopleAre({ rows: [row()] });
    const line = ask(email());
    assert.ok(line, "the line under the conversation");
    // In the canvas's words (1 Nov 2026), and its act the one the header's sheet offers.
    assert.equal(
      textOf(find(line, hasClass("ix-first-email-words"))),
      "First message from Maya. Not someone you serve?",
    );
    const act = find(line, byTestId("ix-first-email-act"));
    assert.equal(textOf(act).trim(), "Not a customer", "the header's act, in its words");
    act.props.onClick();
    assert.deepEqual(opened, ["k9"], "their page, with the question asked");
    assert.deepEqual([...kept.values()], ["k9"]);
    for (const [over, why] of [
      [{ threads: 2 }, "a second conversation"],
      [{ deal: { id: "d1", stage: "won", brief: "Client" } }, "a deal"],
      [{ nextVisitLine: visitLine("Tue, Sep 8", "2:00 PM") }, "a visit"],
    ]) {
      peopleAre({ rows: [row(over)] });
      assert.equal(ask(email()), undefined, `not for someone the business serves: ${why}`);
    }
    peopleAre({ rows: [row()] });
    assert.equal(ask(toInboxThreadVM(conv(), asked, ZONE, NOW)), undefined, "a WhatsApp thread: not a mail sender");
    globalThis.window.mayAtLeast = () => false;
    assert.equal(ask(email()), undefined, "only an owner says a person is not one");
  } finally {
    peopleAre(undefined);
    globalThis.window.mayAtLeast = was.may;
    globalThis.sessionStorage = was.store;
  }
});

test("the reply box says whose its words are while they are the receptionist's draft, unchanged -- once changed, they are the member's", () => {
  // The draft sat in the box unlabelled and read as the member's own typing (the thread canvas, 1 Nov 2026).
  setSurfaceValue("reply_drafts", {
    drafts: [
      {
        conversation_id: "c1",
        kind: "reply",
        for_message_id: "m1",
        words: { text: "Hi Rosa, Friday at 3 works." },
        made_at: at(1),
      },
    ],
    complete: true,
  });
  try {
    const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
    const tree = draw(vm);
    const box = find(tree, (n) => n.type === "textarea" && hasClass("ix-composer-text")(n));
    assert.equal(box.props.value, "Hi Rosa, Friday at 3 works.", "the box holds the draft");
    const drafted = find(tree, byTestId("ix-composer-drafted"));
    assert.equal(textOf(find(drafted, hasClass("ix-composer-drafted-words"))).trim(), "Drafted by the receptionist");
    box.props.onChange({ target: { value: "Hi Rosa, Friday at 3 works for us." } });
    const changed = again(() => InboxThread({ thread: vm, channelLabels: labels, onArchive: () => {} }));
    assert.equal(find(changed, byTestId("ix-composer-drafted")), undefined, "changed, the words are the member's");
  } finally {
    setSurfaceValue("reply_drafts", undefined);
  }
  assert.equal(find(draw(toInboxThreadVM(conv(), asked, ZONE, NOW)), byTestId("ix-composer-drafted")), undefined);
});

test("beside a real thread on a desk, who they are in People's words: their business and reach, then each fact of their row -- a zero said, a visit only where a calendar is read", async () => {
  // It was a page away, behind the header's door (the thread canvas, 1 Nov 2026). Made-up values.
  const { ThreadContext } = await import(`${S}/inbox/pages/thread-context.tsx`);
  const vm = toInboxThreadVM(conv(), asked, ZONE, NOW);
  const row = (over = {}) => ({
    id: "k1",
    email: "rosa@example.com",
    standIn: false,
    worksAt: { leadId: "l1", name: "Fixture Studio", gone: false },
    receptionist: { tone: "escalated", label: "Waiting for a person" },
    firstContact: { ts: 1, label: "Sep 2", estimate: false, evidence: true },
    cameFrom: { key: "whatsapp", label: "WhatsApp" },
    lastContact: { by: "They wrote", when: "40m ago" },
    threads: 1,
    calls: 0,
    calendar: "ok",
    nextVisitLine: null,
    lastVisitLine: null,
    deal: null,
    nextStep: null,
    consent: { label: "Opted in" },
    ...over,
  });
  const opened = [];
  const rail = () => {
    fresh();
    return ThreadContext({ thread: vm, onOpenClient: (id) => opened.push(id) });
  };
  try {
    peopleAre(undefined);
    assert.equal(textOf(find(rail(), hasClass("ix-context-reading"))), "Reading…", "People not read yet");
    peopleAre({ rows: [row()] });
    const drawn = rail();
    assert.equal(drawn.props["aria-label"], "About Rosa Díaz");
    assert.equal(textOf(find(drawn, byTestId("ix-context-works"))).trim(), "Works at Fixture Studio");
    assert.ok(textOf(drawn).includes("rosa@example.com"));
    const said = (key) => textOf(find(drawn, byTestId(`ix-context-${key}`)));
    assert.equal(said("receptionist"), "ReceptionistWaiting for a person");
    assert.equal(said("first"), "First contactSep 2 · WhatsApp");
    assert.equal(said("last"), "Last contactThey wrote · 40m ago");
    assert.equal(said("history"), "History1 conversation · 0 calls");
    // In the workspace's word for it (contracts appointmentWords): "appointment" where none was set.
    assert.equal(said("visit"), "AppointmentNone yet", "a zero is shown");
    assert.equal(find(drawn, byTestId("ix-context-visit")).props["data-none"], "", "in the dim ink");
    assert.equal(said("deal"), "DealNone");
    assert.equal(said("step"), "Next stepNone");
    assert.equal(said("consent"), "ConsentOpted in");
    find(drawn, byTestId("ix-context-door")).props.onClick({ button: 0, preventDefault() {} });
    // No calendar read: nothing is said of a visit, since "None yet" would not be known.
    peopleAre({ rows: [row({ calendar: "none" })] });
    assert.equal(find(rail(), byTestId("ix-context-visit")), undefined);
    peopleAre({
      rows: [
        row({
          nextVisitLine: visitLine("Tue, Sep 8", "2:00 PM"),
          deal: { id: "d1", stage: "won", brief: "Client · since Oct 1" },
          nextStep: { id: "s1", words: "Send the quote", day: { words: "Due today" } },
        }),
      ],
    });
    const full = rail();
    assert.equal(textOf(find(full, byTestId("ix-context-visit"))), "AppointmentTue, Sep 8 · 2:00 PM");
    assert.equal(textOf(find(full, byTestId("ix-context-deal"))), "DealClient · since Oct 1");
    assert.equal(textOf(find(full, byTestId("ix-context-step"))), "Next stepSend the quote · Due today");
  } finally {
    peopleAre(undefined);
  }
  fresh();
  assert.equal(
    ThreadContext({ thread: { ...vm, clientId: null }, onOpenClient: () => {} }),
    null,
    "no person, no rail",
  );
});

test("where a thread was held for a person is a quiet mark between the words, its spark and its time -- the dock says what is owed", () => {
  const tree = draw(toInboxThreadVM(conv(), asked, ZONE, NOW));
  const mark = find(tree, byTestId("tl-held"));
  assert.ok(mark, "the mark");
  // "Held for you · 9:20 AM" (the thread canvas, 1 Nov 2026): why it was held is the dock's line, and the mark's title.
  assert.match(textOf(mark), /^Held for you· \d{1,2}:\d{2} [AP]M$/);
  assert.match(mark.props.title, /asked for a person/);
  assert.ok(!textOf(tree).includes("Flagged for a human"), "REGRESSION: the flag's label, said over the dock's");
});

/* ------------------------------ it moves as one ------------------------------ */

test("a message that arrives while the thread is open rises into place; the ones it opened with are simply there", () => {
  const two = [m("m1", 40, { body: "Hi" }), m("m2", 38, { body: "Is Friday open?" })];
  const opened = draw(toInboxThreadVM(conv({ messages: two }), asked, ZONE, NOW));
  assert.equal(all(opened, hasClass("tl-arrived")).length, 0, "opening a thread animates none of it");
  // The same thread, drawn again with one more message, over the same hook state: as React draws it after a read.
  const more = again(() =>
    InboxThread({
      thread: toInboxThreadVM(conv({ messages: [...two, m("m3", 1, { body: "Or Saturday?" })] }), asked, ZONE, NOW),
      channelLabels: labels,
      onArchive: () => {},
    }),
  );
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

/* --------------------------- an address that stopped --------------------------- */

// B7 (audit, 2 Oct 2026): an address that bounced for good, or whose person marked a message as spam, is refused by the
// reply route (core conversations/reply.ts) after the owner has written the reply. The reply box says so before they
// write, in one sentence of contracts' words, and offers no email to write.
const emailConv = (contact = {}, over = {}) =>
  conv({
    state: "open",
    last_wa_inbound_at: null,
    contact: { ...conv().contact, email: "rosa@example.com", ...contact },
    messages: [m("m1", 40, { channel: "email", body: "Can I move my appointment to Friday?" })],
    ...over,
  });
const stoppedBy = (reason) => ({ email_suppressed_at: "2026-09-03T15:00:00Z", email_suppressed_reason: reason });
const TAIL = "Email can't reach them: correct the address on their page, or reach them another way.";

test("an email thread whose address stopped says why in the reply box before anyone writes, and offers no email to write", () => {
  for (const [reason, why] of [
    ["hard_bounce", "Their address bounced on Sep 3."],
    ["complaint", "They marked a message as spam on Sep 3."],
    ["provider", "The mail provider stopped sending to their address on Sep 3."],
  ]) {
    const vm = toInboxThreadVM(emailConv(stoppedBy(reason)), null, ZONE, NOW);
    assert.equal(vm.emailStopped, `${why} ${TAIL}`, reason);
    const box = find(draw(vm), byTestId("ix-composer-email-stopped"));
    assert.equal(textOf(box), `${why} ${TAIL}`, `${reason}: the box says it`);
    assert.equal(
      find(box, (n) => n.type === "textarea"),
      undefined,
      `${reason}: nothing to type an email into`,
    );
    assert.equal(
      find(box, (n) => n.type === "button"),
      undefined,
      `${reason}: and no Send`,
    );
  }
  // The same thread with an address that works: the box is the ordinary one, naming the channel.
  const fine = draw(toInboxThreadVM(emailConv(), null, ZONE, NOW));
  assert.equal(find(fine, byTestId("ix-composer-email-stopped")), undefined);
  assert.equal(find(fine, hasClass("ix-composer-text")).props.placeholder, "Email to Rosa…");
});

test("a stopped address holds only the replies that would go by email: a thread on WhatsApp keeps its box", () => {
  const onWhatsApp = conv({ contact: { ...conv().contact, email: "rosa@example.com", ...stoppedBy("hard_bounce") } });
  const vm = toInboxThreadVM(onWhatsApp, null, ZONE, NOW);
  assert.equal(vm.emailStopped, null, "they wrote on WhatsApp 40 minutes ago, and the reply goes there");
  const tree = draw(vm);
  assert.equal(find(tree, byTestId("ix-composer-email-stopped")), undefined);
  assert.ok(find(tree, hasClass("ix-composer-text")), "the box to write in");
  // An opt-out is stronger and still the box's own: nothing at all can be sent.
  const both = toInboxThreadVM(
    emailConv({ ...stoppedBy("complaint"), consent: "opted_out", dnc: true }),
    null,
    ZONE,
    NOW,
  );
  assert.match(textOf(find(draw(both), hasClass("ix-composer"))), /asked to stop receiving messages/);
});

test("an automatic email from their address does not move the reply to email: the box says WhatsApp, where they last wrote", () => {
  // They wrote on WhatsApp, then their mail server answered something with an out-of-office. The reply route sends
  // where they last WROTE (dashboard verbs.ts replyChannelOf, contracts isTheirOwnWords), so WhatsApp. The thread read
  // the newest row from their side instead: it said Email, read the stopped address, and took the box away from a
  // reply that would have gone out on WhatsApp.
  const outOfOffice = m("m2", 5, {
    channel: "email",
    body: "I'm away until Monday.",
    meta: { email: { claim: "auto_reply" } },
  });
  const thread = conv({
    contact: { ...conv().contact, email: "rosa@example.com", ...stoppedBy("hard_bounce") },
    messages: [m("m1", 40), outOfOffice],
  });
  const vm = toInboxThreadVM(thread, null, ZONE, NOW);
  assert.equal(vm.primaryChannel, "whatsapp", "REGRESSION: it said email, the wire of the out-of-office");
  assert.equal(vm.emailStopped, null, "REGRESSION: a WhatsApp reply was held by the address that bounced");
  assert.equal(vm.windowOpen, true, "the WhatsApp window they opened 40 minutes ago");
  assert.ok(find(draw(vm), hasClass("ix-composer-text")), "the box to write in");
});

test("the conversations read carries the stop into the thread, and one predicate says it for the reply route, the send door and the box", async () => {
  const { toConversationDto } = await import("../../../../../apps/dashboard/src/server/dto.ts");
  const { CONVERSATION_COLUMNS } = await import("../../../../../apps/dashboard/src/server/dto.ts");
  const { isEmailStopped } = await import("@chanlytics/contracts");
  assert.match(
    CONVERSATION_COLUMNS,
    /email_suppressed_at, email_suppressed_reason\)/,
    "the read asks for both columns",
  );
  const row = {
    id: "c1",
    state: "open",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    last_wa_inbound_at: null,
    last_message_at: null,
    contacts: {
      id: "p1",
      display_name: "Rosa Díaz",
      wa_profile_name: null,
      phone_e164: null,
      email: "rosa@example.com",
      consent: "opted_in",
      dnc: false,
      marketing_consent: null,
      proposal_url: null,
      ...stoppedBy("hard_bounce"),
    },
  };
  const dto = toConversationDto(row, [], "u-me");
  assert.deepEqual(
    [dto.contact.email_suppressed_at, dto.contact.email_suppressed_reason],
    ["2026-09-03T15:00:00Z", "hard_bounce"],
    "REGRESSION: the thread dropped the stop, so the box offered an email the route would refuse",
  );
  assert.equal(isEmailStopped(dto.contact), true);
  assert.equal(isEmailStopped({ ...dto.contact, email_suppressed_at: null }), false);
  const clear = toConversationDto(
    { ...row, contacts: { ...row.contacts, ...{ email_suppressed_at: null, email_suppressed_reason: null } } },
    [],
    "u-me",
  );
  assert.deepEqual([clear.contact.email_suppressed_at, clear.contact.email_suppressed_reason], [null, null]);
});
