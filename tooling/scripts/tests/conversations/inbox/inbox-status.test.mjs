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
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";
import { keysDrawn } from "../../_keys.mjs";
import { installLegacyReact, fresh, again, settle } from "../../_legacy-react.mjs";
import { until } from "../../shared/_until.mjs";

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
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
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
const { Composer: InboxComposer } = await import(`${S}/inbox/thread/composer.tsx`);
const { Icon } = await import(`${S}/kit/icon/icon.tsx`);

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
  fresh();
  return InboxThread({ thread, channelLabels: { whatsapp: "WhatsApp", phone: "Phone", sms: "Text" }, ...over });
};
/**
 * The pane's own rows, top to bottom, by the class each draws. The foot (what it needs from you and the reply box) is one
 * box on a phone and none on a desk (inbox.css `.ix-th-foot`, display: contents): its parts are the pane's rows.
 */
const rowsOf = (pane) =>
  (pane.props.children || [])
    .filter((k) => k && typeof k === "object")
    .flatMap((k) =>
      classOf(k) === "ix-th-foot" ? [k.props.children].flat(Infinity).filter((f) => f && typeof f === "object") : [k],
    )
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
      /^You have it\. · They asked for a person\./,
    ],
    // A teammate's thread: the dock says nothing, and the reply box says what a reply does ("Reply to take it from …").
    theirs: [
      chat({ paused_until: later, assignee_user_id: "u-ana", assignee_is_me: false }),
      asked(),
      /has it· waiting 40m$/,
      /^$/,
    ],
    snoozed: [
      chat({ state: "snoozed", snooze_until: later, paused_until: later }),
      null,
      /^Snoozed· back /,
      /Hidden from your queue/,
    ],
    archived: [chat({ state: "archived" }), null, /^Archived$/, /Their request is closed/],
    // Answered and nothing owed: no bar and no dock (the phone canvas, A1). Who had the last word is the conversation's
    // own last bubble; a sentence for the ordinary state stood over every thread.
    lastWord: [
      chat({ state: "open", messages: [wrote("m1", "Open Sunday?", 30), ours("m2", "Closed Sundays.", 29)] }),
      null,
      /^$/,
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
      flag: !!find(pane, (n) => n.type === Icon && n.props?.name === "flag"),
      wait: find(standing, hasClass("ix-th-standing-meta")),
    };
  };
  const late = signal(40);
  assert.deepEqual([late.pill, late.flag], [true, false], "REGRESSION: a red flag");
  assert.equal(textOf(late.wait), "· waiting 40m");
  assert.ok(late.wait.props.className.split(" ").includes("late"), "amber past thirty minutes");
  const soon = signal(12);
  assert.equal(textOf(soon.wait), "· waiting 12m");
  assert.ok(!soon.wait.props.className.split(" ").includes("late"), "and not before");
});

/* ------------------------------ the conversation ------------------------------ */

test("REGRESSION: a real bubble says its time and what became of it in its own corner, and a day is headed once -- every bubble said 'WhatsApp · 4:24 PM' over it and 'by WhatsApp Receptionist · Read' under it", () => {
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
  const pane = paneOf(vm);
  const bubbles = [];
  walk(pane, (n) => {
    if (hasClass("tl-msg")(n)) bubbles.push(n);
  });
  assert.equal(bubbles.length, 3);
  const has = (b, cls) => !!find(b, hasClass(cls));
  // The phone canvas, D1: a line over every bubble and one under it were 79-127px apiece on a phone.
  assert.deepEqual(
    bubbles.map((b) => [has(b, "tl-msg-meta"), has(b, "tl-msg-by")]),
    [
      [false, false],
      [false, false],
      [false, false],
    ],
    "no line over a bubble, and none under it",
  );
  const stamps = bubbles.map((b) => find(b, hasClass("tl-stamp")));
  assert.ok(
    stamps.every((st) => st && /\d:\d\d [AP]M/.test(textOf(st))),
    "each bubble's time, in its corner",
  );
  assert.ok(!stamps.some((st) => textOf(st).includes("WhatsApp")), "one channel: the time alone");
  assert.ok(
    find(stamps[1], (n) => n.type === Icon && n.props?.name === "sparkle"),
    "the receptionist's words wear its spark, where 'by WhatsApp Receptionist' was",
  );
  assert.equal(
    find(stamps[0], (n) => n.type === Icon && n.props?.name === "sparkle"),
    undefined,
    "and theirs do not",
  );
  assert.deepEqual(
    bubbles.map((b) => hasClass("tl-run")(b)),
    [false, false, true],
    "one side's run stands close together",
  );
  const days = [];
  walk(pane, (n) => {
    if (byTestId("tl-day")(n)) days.push(textOf(n));
  });
  assert.equal(days.length, 1, "the day, once, over the run");
});

test("words that did not reach them say so on their own bubble, whatever follows, with the way to send them again", () => {
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
  assert.ok(hasClass("undelivered")(bubbles[1]), "the words that never left are drawn so");
  assert.ok(
    find(bubbles[1], (n) => n.props?.role === "img" && n.props?.["aria-label"] === "Didn't send"),
    "and say so in their corner",
  );
  assert.ok(find(bubbles[1], byTestId("tl-again-send")), "Send again, on that bubble");
  assert.ok(find(bubbles[1], byTestId("tl-again-edit")), "or put them in the reply box");
  assert.equal(find(bubbles[2], byTestId("tl-again")), undefined, "and only there");
});

test("REGRESSION: a real thread's reply box is one line with Send beside it, naming the channel it goes out on -- a three-line field over a line repeating the channel and the name", () => {
  fresh();
  const box = InboxComposer({ thread: vmOf(chat({ state: "open" })), reply: "", onSend() {} });
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

test("the reply Need you drafted is in an emailed thread's empty box, to change or send from here; an older one, or a member's own words, stay out (the live walk's INBOX-2, 27 Oct 2026)", async () => {
  const mail = (m) => ({ ...m, channel: "email" });
  const dto = chat({ last_wa_inbound_at: null, messages: [mail(wrote("m1", "Can you move a sofa on Friday?", 40))] });
  const esc = { id: "e1", reason: "email_review", details: null, state: "open", created_at: ago(40) };
  const kept = (forId) => ({
    conversation_id: "c1",
    kind: "reply",
    for_message_id: forId,
    words: { text: "Yes, Friday works. Shall I book 10 AM?", subject: "", brief: null, asks: [] },
    made_at: ago(30),
  });
  const realFetch = globalThis.fetch;
  const open = async (forId, typed = null, over = dto) => {
    const asked = [];
    globalThis.fetch = async (url, init = {}) => {
      asked.push(`${init.method ?? "GET"} ${new URL(String(url), "https://app.example").pathname}`);
      const data = init.method === "POST" ? kept(forId) : { drafts: [kept(forId)] };
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    fresh();
    const thread = vmOf(over, esc);
    const draw = () => again(() => InboxComposer({ thread, reply: "", onSend() {} }));
    const first = draw();
    if (typed !== null) find(first, (n) => n.type === "textarea").props.onChange({ target: { value: typed } });
    for (let i = 0; i < 5; i++) await settle();
    return { value: find(draw(), (n) => n.type === "textarea").props.value, asked };
  };
  try {
    const ready = await open("m1");
    assert.equal(ready.value, "Yes, Friday works. Shall I book 10 AM?", "the draft, in the box, nothing sent");
    assert.deepEqual(ready.asked, ["GET /api/v1/conversations/drafts"], "read as Today reads it");
    const stale = await open("m0");
    assert.equal(stale.value, "", "a draft for an older message is not their answer");
    const theirs = await open("m1", "Let me check the van.");
    assert.equal(theirs.value, "Let me check the van.", "a member's own words are never replaced");
    // Answered since (from Gmail, or by a teammate): the draft is kept until they write again, and is no one's to send twice.
    const answered = { ...dto, messages: [...dto.messages, mail(ours("m2", "Friday at 10 works.", 20, "sent"))] };
    assert.equal((await open("m1", null, answered)).value, "", "answered already: the box stays empty");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the kept reply comes with the Inbox's first reads: the box draws with its words in its first frame, with no read of its own; drafts that are all the workspace keeps and hold none say none (the Inbox load review, 28 Oct 2026)", async () => {
  const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
  const mail = (m) => ({ ...m, channel: "email" });
  const dto = chat({ last_wa_inbound_at: null, messages: [mail(wrote("m1", "Can you move a sofa on Friday?", 40))] });
  const esc = { id: "e1", reason: "email_review", details: null, state: "open", created_at: ago(40) };
  const kept = {
    conversation_id: "c1",
    kind: "reply",
    for_message_id: "m1",
    words: { text: "Yes, Friday works. Shall I book 10 AM?", subject: "", brief: null, asks: [] },
    made_at: ago(30),
  };
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(new URL(String(url), "https://app.example").pathname);
    return new Response(JSON.stringify({ ok: true, data: { drafts: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const firstWords = async (drafts) => {
    setSurfaceValue("reply_drafts", { ...drafts, fetchedAt: Date.now() });
    fresh();
    const thread = vmOf(dto, esc);
    const first = again(() => InboxComposer({ thread, reply: "", onSend() {} }));
    for (let i = 0; i < 5; i++) await settle();
    return find(first, (n) => n.type === "textarea").props.value;
  };
  try {
    assert.equal(await firstWords({ drafts: [kept], complete: false }), kept.words.text, "drawn with its words");
    assert.equal(await firstWords({ drafts: [], complete: true }), "", "none kept, and none to read");
    assert.deepEqual(asked, [], "the thread's own read is asked for neither");
    assert.equal(await firstWords({ drafts: [], complete: false }), "", "not among the newest: read by the thread");
    assert.deepEqual(asked, ["/api/v1/conversations/drafts"]);
  } finally {
    globalThis.fetch = realFetch;
    setSurfaceValue("reply_drafts", undefined);
  }
});

// An empty box asks nothing: the test above holds it, on an email thread whose newest drafts hold no reply.
test("what an email from the box is signed with is read for its thread once the box has words, and is said under them (decision 0081)", async () => {
  const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
  const mail = (m) => ({ ...m, channel: "email" });
  const dto = chat({ last_wa_inbound_at: null, messages: [mail(wrote("m1", "Can you move a sofa on Friday?", 40))] });
  const SIG = "Sam Reyes\nHarbor Moving";
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(new URL(String(url), "https://app.example").pathname);
    return new Response(JSON.stringify({ ok: true, data: { drafts: [], complete: true, signed: { c1: SIG } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    // No draft kept for it among the newest, so they cannot say what signs it.
    setSurfaceValue("reply_drafts", { drafts: [], complete: true, fetchedAt: Date.now() });
    fresh();
    const thread = vmOf(dto);
    const draw = () => again(() => InboxComposer({ thread, reply: "", onSend() {} }));
    const tree = draw();
    find(tree, (n) => n.type === "textarea").props.onChange({ target: { value: "Friday works." } });
    const line = () => textOf(find(draw(), byTestId("ix-composer-signed-words")));
    await until(() => line() === "Signed Sam Reyes · Harbor Moving", "the line under the words");
    assert.deepEqual(asked, ["/api/v1/conversations/drafts"], "the thread's own read, once");
  } finally {
    globalThis.fetch = realFetch;
    setSurfaceValue("reply_drafts", undefined);
  }
});

test("REGRESSION: the reply box and a seeded approval draw no key -- Send said ⌘↵ and the card's foot A, D and E, beside the ? sheet that lists them", () => {
  fresh();
  const box = InboxComposer({ thread: vmOf(chat({ state: "open" })), reply: "", onSend() {} });
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
    find(take, (n) => n.type === Icon && n.props?.name === "flag"),
    "with its flag",
  );
});

test("a snoozed thread's band names the request still standing in its own words, not 'asked for a person' for every reason", () => {
  const snoozed = chat({
    state: "snoozed",
    snooze_until: later,
    messages: [wrote("m1", "Any slots Friday?", 400), ours("m2", "Friday at 3.", 399, "failed")],
  });
  const failed = {
    id: "e2",
    reason: "send_failed",
    details: "WhatsApp refused it",
    state: "open",
    created_at: ago(398),
  };
  const pane = paneOf(vmOf(snoozed, failed));
  const band = find(pane, byTestId("ix-snoozed"));
  assert.ok(band, "the snoozed band is drawn");
  const said = textOf(band);
  assert.match(said, /Reply failed to deliver\. That's still waiting for you\./);
  assert.doesNotMatch(said, /asked for a person/i);
  // With nothing open, nothing is said to be waiting.
  const quiet = textOf(find(paneOf(vmOf(snoozed, null)), byTestId("ix-snoozed")));
  assert.doesNotMatch(quiet, /still waiting for you/);
  // A reason whose label says two things says them once, not under a second dash: the band read "The receptionist hit
  // an error — a holding message went out — that's still waiting for you."
  const errored = textOf(find(paneOf(vmOf(snoozed, { ...failed, reason: "brain_error" })), byTestId("ix-snoozed")));
  assert.match(errored, /The receptionist hit an error — a holding message went out\. That's still waiting for you\./);
  assert.equal(errored.split("—").length - 1, 1, "REGRESSION: one dash, the label's own");
});
