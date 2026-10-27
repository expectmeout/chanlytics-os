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
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again } from "../../_legacy-react.mjs";

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
  __href: (_route, p) => `/api/v1/messages/${p.id}/media?workspace=marisas`,
  gate: () => ({}),
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
after(() => Object.assign(globalThis, timers));
// The shell's own helpers the pane spreads and calls (gate, touchSwipe, the toast, canDo), as the app publishes them.
(await import("../../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
const { InboxThread, ixSwipeBack } = await import("../../../../../apps/dashboard/src/surfaces/inbox/thread/thread.tsx");

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
  fresh();
  return InboxThread({
    thread: toInboxThreadVM(dto, escalation, ZONE, NOW),
    channelLabels: { whatsapp: "WhatsApp", phone: "Phone", email: "Email" },
  });
};
// Draw again with the cells kept, so a disclosure that was toggled is drawn open.
const redraw = (dto, escalation = null) =>
  again(() =>
    InboxThread({
      thread: toInboxThreadVM(dto, escalation, ZONE, NOW),
      channelLabels: { whatsapp: "WhatsApp", phone: "Phone", email: "Email" },
    }),
  );

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
  assert.equal(textOf(toggle).trim(), "···", "three dots, as a mail client keeps the chain");
  assert.equal(toggle.props["aria-label"], "Show quoted text", "and they say what they open");

  toggle.props.onClick();
  const open = redraw(dto);
  assert.ok(textOf(open).includes("testing back at you"), "the chain is kept, and opens");
  assert.equal(one(open, byTestId("tl-msg-quote-toggle")).props["aria-label"], "Hide quoted text");
});

/* ------------------------------ the signature ------------------------------ */

// The email that came in on production on 27 Oct 2026, as it was kept.
const SIGNED =
  "needs you test\n\nRuben Segura\nFounder, RJ Capital\n[image: RJ Capital] <https://rjcapital.io>\n" +
  "rjcapital.io  |  ruben@rjcapital.io\n3495 US-1, Princeton, NJ 08540";

test("their signature is one quiet line under their words, and the whole of it on a press", () => {
  const dto = conv([
    msg({ channel: "email", body: SIGNED, meta: { email: { subject: "test need you", from_name: "Ruben Segura" } } }),
  ]);
  const shut = draw(dto);
  const body = one(shut, byClass("tl-msg-body"));
  assert.ok(textOf(body).startsWith("needs you test"), "the words are theirs");
  assert.ok(!textOf(body).includes("[image:"), "REGRESSION: Gmail's picture stand-in was drawn as their words");
  const sig = one(shut, byTestId("tl-msg-sig"));
  assert.ok(sig, "REGRESSION: the signature was drawn as part of what they wrote");
  assert.equal(textOf(sig).trim(), "Ruben Segura · Founder, RJ Capital · rjcapital.io");
  assert.equal(sig.props["aria-expanded"], false);
  assert.equal(one(shut, byTestId("tl-msg-sig-full")), undefined, "shut, the card is one line");

  sig.props.onClick();
  const open = redraw(dto);
  const full = one(open, byTestId("tl-msg-sig-full"));
  assert.ok(textOf(full).includes("3495 US-1, Princeton, NJ 08540"), "open, the whole card");
  assert.equal(one(open, byTestId("tl-msg-sig")).props["aria-expanded"], true);
  assert.ok(!textOf(open).includes("Re: test need you"));
});

test("the thread's subject is said once, in its head, and not over the bubble", () => {
  const tree = draw(
    conv([msg({ channel: "email", body: "needs you test", meta: { email: { subject: "test need you" } } })]),
  );
  assert.equal(textOf(one(tree, byTestId("ix-th-subject"))).trim(), "test need you");
  assert.equal(one(tree, byTestId("tl-msg-subject")), undefined, "REGRESSION: the subject stood over every bubble");
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
  // The bubble's corner is the press (the phone canvas, D1): the receptionist's spark and the time, one tap to why. The
  // line under every reply said "by WhatsApp Receptionist · Why · Delivered".
  assert.equal(textOf(why), "9:01 AM", "the corner says the time, and the spark says whose");
  assert.match(why.props["aria-label"], /Why it said this: Booking · 91% sure$/, "and its name says what it opens");
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

test("a reply of ours says who sent it and what became of it in its corner, and says its time once", () => {
  const tree = draw(conv([msg(), ours({ sender: "human", body: "See you Friday!", status: "read" })]));
  const bubble = one(tree, (n) => byClass("tl-msg")(n) && textOf(n).includes("See you Friday!"));
  const stamp = one(bubble, byClass("tl-stamp"));
  assert.ok(stamp, "a reply of ours says who sent it");
  assert.equal(textOf(stamp), "Your team9:01 AM", "who, then when, in the corner");
  assert.ok(
    one(stamp, (n) => n.props?.role === "img" && n.props?.["aria-label"] === "Read"),
    "and what became of it, as ticks",
  );
  assert.equal(one(bubble, byClass("tl-msg-by")), undefined, "no line under it");
  assert.equal(textOf(bubble).split("9:01 AM").length - 1, 1, "REGRESSION: the time, printed twice");
});

/* ---------------------------- back to the list ---------------------------- */

test("a thread swiped back to its list lets go of the list under it, though it has left the page by then: the next thread opens alone", async () => {
  // The gesture's own timers and a phone's width, for this test alone: the page tests stub both.
  const stubbed = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const media = globalThis.window.matchMedia;
  Object.assign(globalThis, { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  globalThis.window.matchMedia = (q) => ({ matches: q.includes("max-width") });
  try {
    // The Inbox's grid, which draws the list under a thread a thumb is carrying (components.css, data-going).
    const page = {
      marks: new Set(),
      toggleAttribute(name, on) {
        if (on) this.marks.add(name);
        else this.marks.delete(name);
      },
    };
    const threadOn = () => ({
      style: {},
      offsetWidth: 375,
      offsetHeight: 700,
      scrollHeight: 700,
      clientHeight: 700,
      scrollWidth: 375,
      clientWidth: 375,
      scrollTop: 0,
      parentElement: page,
      previousElementSibling: null,
      isConnected: true,
      getClientRects: () => [1],
      matches: () => false,
    });
    const thread = threadOn();
    const back = [];
    const h = ixSwipeBack(() => {
      back.push(1);
      // The page closes it: React takes the thread away, so it has no parent when the gesture lets go of it.
      Object.assign(thread, { parentElement: null, isConnected: false, getClientRects: () => [] });
    });
    h.onTouchStart({ touches: [{ clientX: 60, clientY: 300 }], currentTarget: thread, target: thread });
    h.onTouchMove({ touches: [{ clientX: 140, clientY: 302 }], currentTarget: thread });
    assert.ok(page.marks.has("data-going"), "the list is drawn under it while it moves");
    h.onTouchEnd({ changedTouches: [{ clientX: 260, clientY: 304 }], currentTarget: thread });
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(back, [1], "past a third it goes back to its list");
    assert.ok(
      !page.marks.has("data-going"),
      "REGRESSION: the mark stayed, and the next thread opened over its list, the two showing through each other",
    );

    // Let go short of a third, it settles back where it stood, and the list under it goes with the mark.
    const kept = threadOn();
    h.onTouchStart({ touches: [{ clientX: 60, clientY: 300 }], currentTarget: kept, target: kept });
    h.onTouchMove({ touches: [{ clientX: 120, clientY: 301 }], currentTarget: kept });
    assert.ok(page.marks.has("data-going"));
    // Slowly, so it is no flick.
    await new Promise((r) => setTimeout(r, 200));
    h.onTouchEnd({ changedTouches: [{ clientX: 120, clientY: 301 }], currentTarget: kept });
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(back, [1], "short of a third, it stays open");
    assert.ok(!page.marks.has("data-going"));
    assert.equal(kept.style.transform, "", "and its own rules have it again");
  } finally {
    Object.assign(globalThis, stubbed);
    globalThis.window.matchMedia = media;
  }
});

/* ------------------------------ to its end ------------------------------ */

test("a thread is taken to its end and never past it: asked for its whole height, an iPhone drew the window past the page's end for a few frames", async () => {
  const { threadEnd } = await import("../../../../../apps/dashboard/src/surfaces/inbox/thread/scroller.ts");
  assert.equal(threadEnd({ scrollHeight: 900, clientHeight: 700 }), 200, "a desk's pane: as far as it scrolls");
  assert.equal(threadEnd({ scrollHeight: 500, clientHeight: 700 }), 0, "a conversation shorter than its pane: its top");
  // A phone: the window scrolls the thread (Ruben's iPhone, 23 Oct 2026: a page of 815 in a window of 775 was asked for
  // 815, and Safari stood at 800 and 815 before it came back to 40).
  const root = globalThis.document.documentElement;
  const was = { scrollHeight: root.scrollHeight, clientHeight: root.clientHeight };
  Object.assign(root, { scrollHeight: 815, clientHeight: 775 });
  try {
    assert.equal(threadEnd(root), 40, "the window: the page's end, the room it has to scroll");
  } finally {
    Object.assign(root, was);
  }
});
