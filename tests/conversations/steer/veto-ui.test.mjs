/**
 * The veto window, as an operator sees it.
 *
 * The mockup had already DESIGNED this — a countdown, Edit / Hold / Take over,
 * and a composer pre-filled with the draft — driven by `thread.veto`. Mapping
 * the real held reply onto that shape means the feature arrives as the product
 * was drawn, rather than as a second control that looks nothing like it.
 *
 * The one thing that must NOT carry over is the mockup's simulated send: it
 * runs its own countdown and fabricates the sent bubble at zero. On a real
 * thread the job fires server-side, and inventing that bubble would put words
 * in the transcript that may never have reached the customer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, isHeldDraft, draftSendsAtMs, stateOf, replyWaitsOnYou } from "@chanlytics/contracts";
import { installStubReact, fresh, again, find, textOf } from "../../_stub-react.mjs";
import { bridgeHolds, holdFrameParts } from "../../shell/_bridge-holds.mjs";

bridgeHolds({ parts: { surfaceState: () => "live" } });
installStubReact();
const S = "../../../apps/dashboard/src/surfaces/inbox";
const { VW_STORE, VW_UTIL, IX_STORE } = await import(`${S}/store.ts`);
const { Composer } = await import(`${S}/thread/composer.tsx`);
const { Inbox } = await import(`${S}/pages/inbox-page.tsx`);
const { InboxList } = await import(`${S}/pages/inbox-list.tsx`);
const { InboxThread } = await import(`${S}/thread/thread.tsx`);
const { ThreadStatus } = await import(`${S}/thread/status.tsx`);
const { VetoBar } = await import(`${S}/thread/veto.tsx`);
const { TimelineEntry } = await import(`${S}/thread/timeline.tsx`);
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
bridgeHolds({ parts: { chrome: { state: stateOf, replyWaits: replyWaitsOnYou } } });
// The page's own clocks stand still: the countdown is read from the deadline and the clock the test moves.
Object.assign(globalThis, {
  location: { pathname: "/w/marisas", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
holdFrameParts();

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const NOW = new Date("2026-08-29T12:00:00.000Z");
const msg = (over = {}) => ({
  id: "m1",
  direction: "outbound",
  sender: "ai",
  type: "text",
  body: "Hi! We open at 9.",
  media: null,
  meta: null,
  status: "sent",
  created_at: "2026-08-29T11:59:30.000Z",
  ...over,
});
const conv = (messages) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  last_message_at: null,
  contact: { id: "k1", display_name: "Ana", wa_profile_name: null, phone_e164: "+13475550101" },
  messages,
});

/* ------------------------------ the predicate ----------------------------- */

test("only a QUEUED message from the bot is a held draft", () => {
  assert.equal(isHeldDraft(msg({ status: "queued", sender: "ai" })), true);
  assert.equal(isHeldDraft(msg({ status: "sent", sender: "ai" })), false);
  // A human's queued reply is their own 15s undo, not the bot's veto window —
  // withdrawing it on their behalf would delete a colleague's message.
  assert.equal(isHeldDraft(msg({ status: "queued", sender: "human" })), false);
  assert.equal(isHeldDraft(msg({ status: "canceled", sender: "ai" })), false);
});

test("the deadline is created_at + the configured delay", () => {
  const m = msg({ status: "queued", meta: { delay_ms: 30_000 } });
  assert.equal(draftSendsAtMs(m), new Date(m.created_at).getTime() + 30_000);
});

test("a draft with no recorded delay is due immediately, never never", () => {
  // Better to reconcile a beat early than to leave a countdown that never ends.
  const m = msg({ status: "queued", meta: null });
  assert.equal(draftSendsAtMs(m), new Date(m.created_at).getTime());
});

/* ------------------------------ the viewmodel ----------------------------- */

test("a held draft surfaces in the mockup's own veto shape", () => {
  const vm = toInboxThreadVM(
    conv([msg({ id: "m9", status: "queued", meta: { delay_ms: 30_000 }, body: "We open at 9." })]),
    null,
    ZONE,
    NOW,
  );
  assert.ok(vm.veto, "the VetoBar and Composer both key on thread.veto");
  assert.equal(vm.veto.draft, "We open at 9.");
  assert.equal(vm.veto.messageId, "m9");
  assert.equal(vm.veto.window, 30);
  assert.equal(vm.heldDraft.messageId, "m9");
});

test("no held draft means no veto controls at all", () => {
  const vm = toInboxThreadVM(conv([msg({ status: "sent" })]), null, ZONE, NOW);
  assert.equal(vm.heldDraft, null);
  assert.equal(vm.veto, undefined, "an absent draft must not render a countdown");
});

test("the newest draft is the one offered", () => {
  // If two ever coexist, the newer is what the customer would receive.
  const vm = toInboxThreadVM(
    conv([msg({ id: "old", status: "queued", body: "first" }), msg({ id: "new", status: "queued", body: "second" })]),
    null,
    ZONE,
    NOW,
  );
  assert.equal(vm.heldDraft.messageId, "new");
});

test("the draft bubble is marked pending, not shown as sent", () => {
  const vm = toInboxThreadVM(conv([msg({ status: "queued", meta: { delay_ms: 15_000 } })]), null, ZONE, NOW);
  const bubble = vm.timeline.find((e) => e.type === "msg");
  assert.equal(bubble.pending, true);
  assert.ok(bubble.sendsAtMs > 0);
});

/* -------------------------------- the engine ------------------------------ */

/** A real thread holding a draft the server sends at 12:01:00, a minute after NOW. */
const holding = () =>
  toInboxThreadVM(
    conv([
      msg({ id: "m0", direction: "inbound", sender: "customer", body: "Are you open Sunday?", status: "received" }),
      msg({ id: "m3", status: "queued", meta: { delay_ms: 90_000 }, body: "We open at 9." }),
    ]),
    null,
    ZONE,
    NOW,
  );
/**
 * The Inbox drawn over one thread, as its read lands it: what it handed the pane (the one thread's, thread-pane.tsx) and
 * the list, whose row says when the draft sends (`sendingIn`, the page's own countdown).
 */
const inboxOver = (thread) => {
  setSurfaceValue("inbox", {
    INBOX_BUCKETS: [
      { id: "escalated", label: "Needs you" },
      { id: "done", label: "Handled" },
    ],
    INBOX_VIEWS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: {},
    THREADS: [thread],
  });
  fresh();
  return () => {
    const tree = again(() => Inbox({}));
    return {
      pane: find(tree, (n) => n.type === InboxThread).props,
      list: find(tree, (n) => n.type === InboxList).props,
    };
  };
};

test("a real countdown reads the SERVER's deadline, on the clock as it moves: the pane's and the row's", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  VW_STORE.state = {};
  const vm = holding();
  assert.equal(vm.veto.endsAtMs, NOW.getTime() + 60_000, "the deadline the view model carries");
  const inbox = inboxOver(vm);
  let drawn = inbox();
  assert.equal(drawn.pane.veto, 60, "a minute to the server's deadline");
  assert.equal(drawn.list.sendingIn(vm.id), 60, "and the row says the same");
  t.mock.timers.tick(45_500);
  drawn = inbox();
  assert.equal(drawn.pane.veto, 15, "the same deadline, read again as the clock moves");
  assert.equal(drawn.list.sendingIn(vm.id), 15, "on the row too");
  VW_STORE.state = {};
});

test("REGRESSION: a real thread never fabricates its own sent bubble: at zero the Inbox reads the thread again", (t) => {
  // The mockup mutates the timeline at zero. Doing that on real data would put
  // a message in the transcript that may never have reached the customer.
  t.mock.timers.enable({ apis: ["Date"], now: new Date(NOW.getTime() + 61_000) });
  VW_STORE.state = {};
  const vm = holding();
  IX_STORE.clear(vm.id);
  try {
    const { pane } = inboxOver(vm)();
    assert.equal(pane.veto, 0, "past the deadline: sending, never a number below zero");
    const drawn = pane.thread;
    assert.deepEqual(
      drawn.timeline.map((e) => [e.type, e.body]),
      vm.timeline.map((e) => [e.type, e.body]),
      "the thread as the server read it: no bubble written in the tab",
    );
    assert.equal(drawn.state, vm.state, "and its state the server's");
    assert.equal(IX_STORE.get(vm.id), null, "no decision recorded for a send the tab never made");
    assert.equal(VW_STORE.state["draft:m3"]?.tries, 1, "the Inbox asked for the thread again, once, past the deadline");
  } finally {
    VW_STORE.state = {};
  }
});

test("VW_UTIL's simulated timer is kept off real threads", () => {
  // Two clocks on one draft would disagree about when the customer hears from us.
  VW_STORE.state = {};
  VW_UTIL.seed([{ id: "th-real", real: true, veto: { window: 30 } }]);
  assert.deepEqual(VW_STORE.state, {}, "a real draft's countdown belongs to its job, not to this store");
  VW_UTIL.seed([{ id: "th-seed", veto: { window: 30 } }]);
  assert.ok(VW_STORE.state["th-seed"], "the mockup's own thread keeps its simulated countdown");
  VW_STORE.state = {};
});

// "Hold and first-keystroke both commit server-side" moved with the hold itself into the one thread
// (surfaces/inbox/thread/thread-verbs.tsx's threadVerbs), where it is a function a test can run instead of a string to read:
// one-thread.test.mjs proves it there.

test("the draft bubble is visually distinct from a sent one", () => {
  const vm = toInboxThreadVM(
    conv([msg({ id: "m1", status: "sent" }), msg({ id: "m3", status: "queued", meta: { delay_ms: 90_000 } })]),
    null,
    ZONE,
    NOW,
  );
  const bubbleOf = (entry) => {
    fresh();
    return again(() => TimelineEntry({ entry, thread: vm, channelLabels: { whatsapp: "WhatsApp" } }));
  };
  const [sent, held] = ["m1", "m3"].map((id) =>
    bubbleOf(vm.timeline.find((e) => e.type === "msg" && e.messageId === id)),
  );
  const tagOf = (tree) =>
    find(tree, (n) =>
      String(n.props?.className ?? "")
        .split(" ")
        .includes("tl-held-tag"),
    );
  const isHeld = (tree) => find(tree, (n) => /\btl-msg\b/.test(String(n.props?.className ?? ""))).props.className;
  assert.equal(textOf(tagOf(held)), "Not sent yet", "the draft says it has not gone");
  assert.match(isHeld(held), /\bheld\b/, "and its bubble is drawn held");
  assert.equal(tagOf(sent), null, "a sent bubble says nothing of the kind");
  assert.doesNotMatch(isHeld(sent), /\bheld\b/);
});

test("REGRESSION: the VetoBar shows on a HANDLED real thread", () => {
  // Found by looking at it, not by reasoning about it. In the mockup "done"
  // means decided; on a real thread "handled" is the normal resting state —
  // the receptionist answered and nothing escalated — which is exactly the
  // state a held draft sits in. The old gate hid the controls in the common
  // case and left the draft unstoppable from the UI.
  // The bar stands over a thread whose conversation is still being read (`partial`); once it is drawn, under the draft's
  // own bubble (thread.tsx heldDraftRow).
  const vm = { ...holding(), partial: true, state: "done" };
  const barOn = (thread, over = {}) => {
    fresh();
    const tree = again(() =>
      ThreadStatus({ thread, decided: false, veto: 42, onVetoAct() {}, onTakeOver() {}, onHandBack() {}, ...over }),
    );
    return find(tree, (n) => n.type === VetoBar);
  };
  assert.ok(barOn(vm), "REGRESSION: hidden on a handled real thread, the draft unstoppable");
  assert.equal(barOn(vm).props.remaining, 42, "counting down to the server's deadline");
  assert.equal(barOn(vm, { decided: true }), null, "a draft decided has no bar");
  assert.equal(barOn({ ...vm, real: false }), null, "the mockup's own 'done' still means decided");
});

/**
 * The reply box, drawn on the stub React: its text box. A draft that arrives is a new prop; the effect that seeds the
 * box sets its state, which React draws again, so a draw that brings a draft is followed by the one that shows it.
 */
const REAL = { id: "th-c1", real: true, who: "Ana", primaryChannel: "whatsapp", hasChat: true, windowOpen: true };
const drawBox = (reply) => again(() => Composer({ thread: REAL, reply }));
const arrives = (reply) => {
  drawBox(reply);
  return drawBox(reply);
};
const box = (tree) => find(tree, (n) => n.type === "textarea");

test("REGRESSION: the composer fills when a draft ARRIVES, not only on mount", () => {
  // useState(reply) reads its argument once. In the mockup that suffices — the
  // draft is in the seed data before the pane renders. On a real thread the
  // receptionist writes while the operator is already looking at the
  // conversation, so the draft always arrives AFTER mount and the composer
  // stayed empty: "Edit" focused a blank box.
  fresh();
  assert.equal(box(drawBox("")).props.value, "", "mounted with no draft: an empty box");
  assert.equal(box(arrives("We open at 9.")).props.value, "We open at 9.", "the draft arrives, and fills it");
});

test("an arriving draft never overwrites what the operator is typing", () => {
  fresh();
  drawBox("");
  box(drawBox("")).props.onChange({ target: { value: "Actually, 10 on Sundays." } });
  assert.equal(box(drawBox("")).props.value, "Actually, 10 on Sundays.", "the operator's words");
  assert.equal(
    box(arrives("We open at 9.")).props.value,
    "Actually, 10 on Sundays.",
    "a draft that arrives over their words does not replace them",
  );
});
