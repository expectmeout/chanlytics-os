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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toInboxThreadVM, isHeldDraft, draftSendsAtMs } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
const S = "../../../../apps/dashboard/src/surfaces/inbox";
const { VW_STORE, VW_UTIL } = await import(`${S}/store.ts`);
const { Composer } = await import(`${S}/thread/composer.tsx`);

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

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

const inbox = read("apps/dashboard/src/surfaces/inbox/pages/inbox-state.tsx");
const timeline = read("apps/dashboard/src/surfaces/inbox/thread/timeline.tsx");
const status = read("apps/dashboard/src/surfaces/inbox/thread/status.tsx");

test("REGRESSION: a real thread never fabricates its own sent bubble", () => {
  // The mockup mutates the timeline at zero. Doing that on real data would put
  // a message in the transcript that may never have reached the customer.
  assert.match(inbox, /if \(t\.real\) \{[\s\S]{0,400}?refreshInbox/);
});

test("a real countdown reads the SERVER's deadline", () => {
  assert.match(inbox, /t\.veto\.endsAtMs \?\? NaN\) - Date\.now\(\)/);
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
  assert.match(timeline, /const held = !!entry\.pending;/);
  assert.match(timeline, /tl-held-tag/);
});

test("REGRESSION: the VetoBar shows on a HANDLED real thread", () => {
  // Found by looking at it, not by reasoning about it. In the mockup "done"
  // means decided; on a real thread "handled" is the normal resting state —
  // the receptionist answered and nothing escalated — which is exactly the
  // state a held draft sits in. The old gate hid the controls in the common
  // case and left the draft unstoppable from the UI.
  assert.match(status, /hasVeto\(thread\) &&\s*!decided &&\s*\(thread\.real \|\| thread\.state !== "done"\)/);
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
