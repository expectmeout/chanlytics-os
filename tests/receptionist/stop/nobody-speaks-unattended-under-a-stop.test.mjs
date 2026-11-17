/**
 * Stop everything and the receptionist (core inbound/reply-posture.ts). While a workspace's owner has stopped all
 * sending, no setting lets the receptionist speak without a person: the workspace's own mode and a person's own both
 * read as "Asks you", so a customer's message is drafted for a person, exactly as a workspace set to Asks you has it. A
 * mode that already keeps the receptionist out (never) stands. With no stop, nothing changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveReplyMode, holdsForAStop } from "../../../packages/core/src/inbound/reply-posture.ts";
import { readModeInForce } from "../../../packages/core/src/inbound/gates.ts";

const STOPPED = true;

test("under a stop, a mode that speaks without a person reads as Asks you, the workspace's and a person's own alike", () => {
  for (const [workspace, person] of [
    ["auto", null],
    ["veto", null],
    ["ask", "auto"],
    ["auto", "veto"],
  ])
    assert.equal(effectiveReplyMode({ replyMode: workspace }, person, STOPPED), "ask", `${workspace}/${person}`);
});

test("under a stop, a mode that already holds the receptionist stands: never stays never, ask stays ask", () => {
  assert.equal(effectiveReplyMode({ replyMode: "auto" }, "never", STOPPED), "never");
  assert.equal(effectiveReplyMode({ replyMode: "never" }, null, STOPPED), "never");
  assert.equal(effectiveReplyMode({ replyMode: "ask" }, null, STOPPED), "ask");
});

test("with no stop, the mode in force is what it always was", () => {
  assert.equal(effectiveReplyMode({ replyMode: "auto" }, null, false), "auto");
  assert.equal(effectiveReplyMode({ replyMode: "ask" }, "veto", false), "veto");
});

test("the stop is the runtime's to say: a runtime that was not read says none", () => {
  assert.equal(holdsForAStop({ stopped: true }), true);
  assert.equal(holdsForAStop({ stopped: false }), false);
  assert.equal(holdsForAStop(null), false, "no runtime already holds for a person");
});

/** The inbound context as readModeInForce reads it: the posture, whether sending is stopped, and the person's own mode. */
const contextOf = (personReplyMode) => ({
  db: null,
  tenantId: "t1",
  posture: { replyMode: "auto" },
  stopped: STOPPED,
  ports: { leads: { personReplyMode } },
  L: { warn: () => {} },
});

test("the mode in force for one message obeys the stop, and still does when the person's own mode cannot be read", async () => {
  const none = await readModeInForce(
    contextOf(async () => null),
    { contact_id: "k1" },
  );
  assert.deepEqual(none, { replyMode: "ask", personMode: null });
  const own = await readModeInForce(
    contextOf(async () => "auto"),
    { contact_id: "k1" },
  );
  assert.deepEqual(own, { replyMode: "ask", personMode: "auto" }, "their own mode is kept as read, and held");
  const unread = await readModeInForce(
    contextOf(async () => {
      throw new Error("lookup failed");
    }),
    { contact_id: "k1" },
  );
  assert.equal(unread.replyMode, "ask", "a blip neither silences nor unmutes anyone: the stop still holds");
});
