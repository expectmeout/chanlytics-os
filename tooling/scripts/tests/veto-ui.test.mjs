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

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

const NOW = new Date("2026-08-29T12:00:00.000Z");
const msg = (over = {}) => ({
  id: "m1", direction: "outbound", sender: "ai", type: "text", body: "Hi! We open at 9.",
  media: null, meta: null, status: "sent", created_at: "2026-08-29T11:59:30.000Z", ...over,
});
const conv = (messages) => ({
  id: "c1", state: "open", paused_until: null, last_message_at: null,
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
    null, NOW,
  );
  assert.ok(vm.veto, "the VetoBar and Composer both key on thread.veto");
  assert.equal(vm.veto.draft, "We open at 9.");
  assert.equal(vm.veto.messageId, "m9");
  assert.equal(vm.veto.window, 30);
  assert.equal(vm.heldDraft.messageId, "m9");
});

test("no held draft means no veto controls at all", () => {
  const vm = toInboxThreadVM(conv([msg({ status: "sent" })]), null, NOW);
  assert.equal(vm.heldDraft, null);
  assert.equal(vm.veto, undefined, "an absent draft must not render a countdown");
});

test("the newest draft is the one offered", () => {
  // If two ever coexist, the newer is what the customer would receive.
  const vm = toInboxThreadVM(
    conv([
      msg({ id: "old", status: "queued", body: "first" }),
      msg({ id: "new", status: "queued", body: "second" }),
    ]),
    null, NOW,
  );
  assert.equal(vm.heldDraft.messageId, "new");
});

test("the draft bubble is marked pending, not shown as sent", () => {
  const vm = toInboxThreadVM(conv([msg({ status: "queued", meta: { delay_ms: 15_000 } })]), null, NOW);
  const bubble = vm.timeline.find((e) => e.type === "msg");
  assert.equal(bubble.pending, true);
  assert.ok(bubble.sendsAtMs > 0);
});

/* -------------------------------- the engine ------------------------------ */

const inbox = read("apps/dashboard/src/legacy/pages/inbox.jsx");
const thread = read("apps/dashboard/src/legacy/pages/inbox-thread.jsx");
const data = read("apps/dashboard/src/legacy/data/inbox-data.jsx");

test("REGRESSION: a real thread never fabricates its own sent bubble", () => {
  // The mockup mutates the timeline at zero. Doing that on real data would put
  // a message in the transcript that may never have reached the customer.
  assert.match(inbox, /if \(t\.real\) \{[\s\S]{0,400}?__refreshInbox/);
});

test("a real countdown reads the SERVER's deadline", () => {
  assert.match(inbox, /t\.veto\.endsAtMs - Date\.now\(\)/);
});

test("VW_UTIL's simulated timer is kept off real threads", () => {
  // Two clocks on one draft would disagree about when the customer hears from us.
  assert.match(data, /if \(t\.real\) return;/);
});

test("Hold and first-keystroke both commit server-side", () => {
  const fn = inbox.slice(inbox.indexOf("const realVetoAct"));
  assert.match(fn, /__cancelSend\(t\.veto\.messageId\)/);
  assert.match(fn, /act !== "hold" && act !== "type"/);
  // A failed cancel must not leave the UI claiming a hold that never happened.
  assert.match(fn, /st\.held = false;/);
});

test("the draft bubble is visually distinct from a sent one", () => {
  assert.match(thread, /const held = !!entry\.pending;/);
  assert.match(thread, /tl-held-tag/);
});

test("REGRESSION: the VetoBar shows on a HANDLED real thread", () => {
  // Found by looking at it, not by reasoning about it. In the mockup "done"
  // means decided; on a real thread "handled" is the normal resting state —
  // the receptionist answered and nothing escalated — which is exactly the
  // state a held draft sits in. The old gate hid the controls in the common
  // case and left the draft unstoppable from the UI.
  assert.match(thread, /thread\.veto && !decided && \(thread\.real \|\| thread\.state !== "done"\)/);
});
