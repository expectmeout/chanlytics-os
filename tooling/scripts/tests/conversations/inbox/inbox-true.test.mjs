/**
 * The open thread says what is true, and says it once (I1).
 *
 * Seen on the salon's workspace, 15 Sep 2026, look-only:
 * - a quiet thread still carrying a teammate's name said three things, two of them false: "billing@… is
 *   answering this. The receptionist stays quiet until they hand it back.", "Answered by the receptionist
 *   — no one asked for you." and, in the strip, "Receptionist: Answering";
 * - two threads whose last reply never left read "Answered by the receptionist — no one asked for you" and
 *   "Nothing is owed", and the reply that failed was drawn as a sent bubble with no word about it;
 * - a call note was drawn as words the receptionist sent;
 * - "Where this stands" said the banner's sentence again below it, and the flag's details were cut mid-word
 *   inside their quotes.
 * Run against the contracts that decide it, and the thread pane drawn on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, standingOf, stateOf, memberWords } from "@chanlytics/contracts";
import { hookFrames } from "../../_hook-frames.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-15T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

const TEAMMATE = "u-ana";
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
const ours = (id, sender, body, min, status = "delivered", meta = null) => ({
  id,
  direction: "outbound",
  sender,
  type: "text",
  body,
  media: null,
  meta,
  status,
  created_at: ago(min),
  channel_ts: ago(min),
});
const callNote = (id, min) => ({
  id,
  direction: "inbound",
  sender: "system",
  type: "call_summary",
  body: "Inbound call · 3 min — asked about a bridal trial",
  media: null,
  meta: {},
  status: "received",
  created_at: ago(min),
  channel_ts: ago(min),
});
const quiet = (messages, over = {}) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(300),
  last_message_at: ago(1),
  contact: rosa,
  messages,
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
const vmOf = (dto, esc = null) => toInboxThreadVM(dto, esc, ZONE, NOW);

/* ------------------------------- the view model ------------------------------- */

test("a teammate's name on a thread nobody flagged is not a claim: the thread is quiet, and says who had the last word", () => {
  const leftOver = {
    state: "open",
    paused_until: null,
    assignee_user_id: TEAMMATE,
    assignee_is_me: false,
    open_escalation: false,
  };
  assert.equal(
    standingOf(leftOver, NOW.getTime()).claimedByOther,
    false,
    "REGRESSION: a name left on the row read as a teammate answering",
  );
  const vm = vmOf(
    quiet(
      [wrote("m1", "Is Saturday open?", 300), ours("m2", "ai", "Yes, from 9.", 299), wrote("m3", "Great, thanks", 200)],
      { assignee_user_id: TEAMMATE, assignee_is_me: false },
    ),
  );
  assert.deepEqual([vm.state, vm.claimedByOther, vm.needsYou], ["done", false, false]);
  assert.deepEqual(
    [vm.subject, vm.preview],
    ["", "Great, thanks"],
    "its row says what they wrote last, not 'A teammate is answering this'",
  );
  assert.equal(vm.summary, "They wrote last — no reply yet.", "and its one sentence is the true one");

  const flagged = vmOf(
    quiet([wrote("m1", "Can I speak to Marisa?", 40)], {
      state: "needs_human",
      assignee_user_id: TEAMMATE,
      assignee_is_me: false,
    }),
    asked(),
  );
  assert.deepEqual(
    [flagged.claimedByOther, flagged.needsYou, flagged.lastWord],
    [true, false, null],
    "a teammate who took a flagged thread still has it",
  );
});

test("a quiet thread says who had the last word, in the words Conversations uses, and says when a reply didn't send", () => {
  const word = (messages, over) => vmOf(quiet(messages, over)).lastWord;
  assert.deepEqual(word([wrote("m1", "Open Sunday?", 30), ours("m2", "ai", "Closed Sundays.", 29)]), {
    text: "Answered by the receptionist — no one asked for you.",
    tone: "ok",
    short: null,
  });
  assert.deepEqual(word([wrote("m1", "Open Sunday?", 30), ours("m2", "human", "We are closed, sorry!", 20, "read")]), {
    text: "Answered by your team — no one asked for you.",
    tone: "ok",
    short: null,
  });
  assert.deepEqual(
    word([ours("m1", "ai", "Welcome back!", 30, "delivered", { source: "broadcast", playbook_name: "Welcome" })]),
    { text: "Last message: the Welcome playbook — no one asked for you.", tone: "ok", short: null },
  );
  assert.deepEqual(word([ours("m1", "ai", "Hi", 40), wrote("m2", "Thanks!", 30)]), {
    text: "They wrote last — no reply yet.",
    tone: "plain",
    short: null,
  });
  assert.deepEqual(
    word([wrote("m1", "Can I book at 3?", 30), ours("m2", "ai", "3pm works, booked!", 29, "failed")]),
    {
      text: "They wrote last, and the reply from the receptionist didn't send — as far as they know, nobody answered.",
      tone: "danger",
      short: "Didn't send",
    },
    "REGRESSION: it read 'Answered by the receptionist — no one asked for you'",
  );
  assert.deepEqual(
    word([
      wrote("m1", "Open Sunday?", 30),
      ours("m2", "ai", "Closed Sundays.", 29),
      ours("m3", "human", "See you Monday!", 10, "failed"),
    ]),
    {
      text: "Answered by the receptionist — the last message from your team didn't send.",
      tone: "warn",
      short: "Didn't send",
    },
    "they were answered; what failed is a later word, and the line says both",
  );
  assert.deepEqual(word([ours("m1", "human", "Hi Rosa", 10, "failed")], { last_wa_inbound_at: null }), {
    text: "Nothing has reached them — the message from your team didn't send.",
    tone: "danger",
    short: "Didn't send",
  });
  assert.deepEqual(
    word([wrote("m1", "Open Sunday?", 30), ours("m2", "ai", "Closed.", 29, "canceled")]),
    { text: "They wrote last — no reply yet.", tone: "plain", short: null },
    "a reply someone canceled is not a failure: they are simply waiting",
  );
  assert.deepEqual(word([callNote("m1", 30)], { last_wa_inbound_at: null }), {
    text: "The phone receptionist handled their call — no one asked for you.",
    tone: "ok",
    short: null,
  });
  assert.deepEqual(word([]), { text: "No messages yet.", tone: "plain", short: null });
  assert.equal(
    vmOf(quiet([wrote("m1", "hi", 30)], { state: "archived" })).lastWord,
    null,
    "an archived thread says it was archived",
  );
  assert.equal(
    vmOf(quiet([wrote("m1", "hi", 30)], { state: "needs_human" }), asked()).lastWord,
    null,
    "a thread waiting on a person says that, not who spoke last",
  );
});

test("every message of ours carries what became of it, the receptionist's as much as the team's", () => {
  const vm = vmOf(
    quiet([
      callNote("m0", 60),
      wrote("m1", "Can I book at 3?", 30),
      ours("m2", "ai", "3pm works, booked!", 29, "failed"),
      ours("m3", "ai", "Bring a photo", 28, "delivered"),
    ]),
  );
  const [note, theirs, failed, delivered] = vm.timeline.filter((e) => e.type === "msg");
  assert.deepEqual(
    [failed.statusLabel, failed.reachedCustomer],
    ["Didn't send", false],
    "REGRESSION: the page could not tell the receptionist's failed reply from a sent one",
  );
  assert.deepEqual([delivered.statusLabel, delivered.reachedCustomer], ["Delivered", true]);
  assert.equal(theirs.reachedCustomer, undefined, "the customer's own words have no send status");
  assert.deepEqual([note.channel, note.from], ["phone", "agent"]);
});

test("a call back's flag says why it was flagged, and its to-do is said once, whole, as the band's sentence", () => {
  const vm = (details) =>
    vmOf(
      quiet([callNote("m1", 60)], { state: "needs_human", last_wa_inbound_at: null }),
      asked({ reason: "callback", details }),
    );
  const long =
    "Call Emily back to confirm the bridal trial on October 3 — she needs a quote for three people and asked to speak with Marisa directly";
  const flag = vm(long).timeline.find((e) => e.type === "event").body;
  // It quoted the to-do (cut at 120 characters), under the band that said it again beside "From the call".
  assert.equal(
    flag,
    "Flagged for a human — Needs a call back — the phone receptionist could not finish it",
    "REGRESSION: the flag quoted the to-do a third time",
  );
  assert.equal(vm(long).summary, long, "said whole, where it is acted on");
});

test("any other flag's details are said there, whole, or cut at a word with an ellipsis -- never mid-word inside their quotes", () => {
  // The cause of a failed send is said only on the flag (thread.spec.ts reads it there).
  const flag = (details) =>
    vmOf(
      quiet([wrote("m1", "Can I book at 3?", 60)], { state: "needs_human" }),
      asked({ reason: "send_failed", details }),
    ).timeline.find((e) => e.type === "event").body;
  assert.match(
    flag("the WhatsApp number is not connected"),
    /^Flagged for a human — .* · “the WhatsApp number is not connected”$/,
  );
  const long =
    "The reply could not be delivered because the WhatsApp number is not connected to this workspace any more, so reconnect it from Settings before anything else";
  const cut = flag(long);
  assert.match(cut, /…”$/, "REGRESSION: cut at 120 characters, mid-word, with nothing to say so");
  const kept = cut.slice(cut.indexOf("“") + 1, -2);
  assert.ok(long.startsWith(kept) && long[kept.length] === " ", `cut after a whole word: "${kept}"`);
});

/* ------------------------------ the pane, drawn ------------------------------ */

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
  "Confirm",
  "usePPToast",
  "useHotkey",
])
  globalThis[k] = globalThis.window[k];
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
const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};
const hasClass = (cls) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls);
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const paneOf = (thread) => {
  cells = [];
  frames.begin();
  return InboxThread({ thread, channelLabels: { whatsapp: "WhatsApp", phone: "Phone" } });
};

test("the pane: a quiet thread says its last word once, in its tone; the reply that didn't send says so; a call is a call", () => {
  const tree = paneOf(
    vmOf(
      quiet([
        callNote("m0", 60),
        wrote("m1", "Can I book at 3?", 30),
        ours("m2", "ai", "3pm works, booked!", 29, "failed"),
      ]),
    ),
  );
  const word = find(tree, byTestId("ix-last-word"));
  assert.ok(word, "the quiet thread's one line");
  assert.match(textOf(word), /They wrote last, and the reply from the receptionist didn't send/);
  assert.ok(hasClass("danger")(word), "in the tone of what it says");
  assert.ok(
    !textOf(tree).includes("no one asked for you"),
    "REGRESSION: 'Answered by the receptionist — no one asked for you' over a reply that never left",
  );
  assert.ok(!textOf(tree).includes("Where this stands"), "REGRESSION: the banner's sentence was said again below it");

  const bubbles = all(tree, hasClass("tl-msg"));
  const failed = bubbles.find((b) => textOf(b).includes("3pm works"));
  assert.ok(hasClass("undelivered")(failed), "REGRESSION: drawn as a reply the customer read");
  assert.match(textOf(failed), /Didn't send/);
  // A call is part of the conversation, where it happened (calls-in-the-thread.test.mjs) -- never a bubble of words.
  assert.equal(
    bubbles.find((b) => textOf(b).includes("bridal trial")),
    undefined,
    "REGRESSION: a call note was drawn as words the receptionist sent",
  );
  const call = find(tree, byTestId("tl-call"));
  assert.deepEqual(
    [
      textOf(find(call, hasClass("tl-call-kind"))),
      textOf(find(call, hasClass("tl-call-length"))),
      textOf(find(call, hasClass("tl-call-about"))),
    ],
    ["Inbound call", "3 min", "asked about a bridal trial"],
  );

  // A quiet thread's one sentence is the bar's under the header, in the tone of what it says.
  const answered = find(
    paneOf(vmOf(quiet([wrote("m1", "Open Sunday?", 30), ours("m2", "ai", "Closed Sundays.", 29, "read")]))),
    hasClass("ix-th-standing-words"),
  );
  assert.equal(textOf(answered), "Answered by the receptionist — no one asked for you.");
  assert.ok(
    hasClass("ok")(answered) && !hasClass("danger")(answered) && !hasClass("warn")(answered),
    "an answered thread keeps the plain green line",
  );
});

test("the pane: a thread you have says why it was flagged, where 'Where this stands' said it, and that the receptionist is quiet while you have it", () => {
  const later = new Date(NOW.getTime() + 3_600_000).toISOString();
  const mine = vmOf(
    quiet([wrote("m1", "Can I speak to someone?", 40)], {
      state: "needs_human",
      paused_until: later,
      assignee_user_id: "u-me",
      assignee_is_me: true,
    }),
    asked(),
  );
  assert.equal(mine.takenOver, true);
  const tree = paneOf(mine);
  assert.equal(textOf(find(tree, byTestId("ix-th-standing"))), "You have it", "the pill its row wears, in the bar");
  const owned = find(tree, byTestId("ix-yours"));
  assert.ok(owned, "the owned thread's line");
  assert.match(textOf(owned), /^The receptionist stays quiet while you have it\./);
  assert.match(
    textOf(owned),
    /They asked for a person\. A holding message went out — they're waiting on you\./,
    "the reason, now said here once",
  );
  assert.ok(!textOf(tree).includes("agents are standing down"), "one receptionist, not agents");
  assert.ok(!textOf(tree).includes("Where this stands"));
});
