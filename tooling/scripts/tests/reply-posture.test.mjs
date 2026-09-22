/**
 * The rule for "may the receptionist speak, and in whose voice".
 *
 * A routed workspace whose runtime was read follows its own reply policy;
 * anything else holds for a person. The rows that matter are the ones that
 * used to be wrong: a channel set to status='disabled' on the environment's
 * own number once kept answering from a baked profile with tenantId null, so
 * the off switch made the receptionist LESS accountable, not silent; and a
 * control-plane read failure on that number once answered from a copy of one
 * workspace's profile kept outside the database. Neither has a voice now.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { replyPosture, effectiveReplyMode } from "../../../apps/edge/lib/receptionist/reply-posture.ts";

test("a routed workspace with a usable runtime follows its OWN policy", () => {
  assert.deepEqual(replyPosture({ runtimeUsable: true, policyMode: "auto" }), { replyMode: "auto" });
  assert.deepEqual(replyPosture({ runtimeUsable: true, policyMode: "veto" }), { replyMode: "veto" });
  assert.deepEqual(replyPosture({ runtimeUsable: true, policyMode: "ask" }), { replyMode: "ask" });
  assert.deepEqual(replyPosture({ runtimeUsable: true, policyMode: "never" }), { replyMode: "never" });
});

test("a missing policy mode fails safe to 'ask'", () => {
  assert.deepEqual(replyPosture({ runtimeUsable: true }), { replyMode: "ask" });
});

test("a runtime that could not be read holds for a person, whatever the policy said", () => {
  // A read failure, a broken config row, a disabled channel and an unknown
  // number all reach the handler as "no usable runtime", and none of them is
  // a voice. There is no fallback profile to answer from.
  assert.deepEqual(replyPosture({ runtimeUsable: false, policyMode: "auto" }), { replyMode: "ask" });
  assert.deepEqual(replyPosture({ runtimeUsable: false }), { replyMode: "ask" });
});

test("'auto' is never granted without a usable runtime", () => {
  for (const runtimeUsable of [true, false]) {
    for (const policyMode of ["auto", "veto", "ask", "never", undefined]) {
      const p = replyPosture({ runtimeUsable, policyMode });
      if (p.replyMode === "auto" || p.replyMode === "veto")
        assert.ok(runtimeUsable, `${p.replyMode} granted with no runtime to say so`);
    }
  }
});

/* ---------------------- the person's own setting wins -------------------- */

test("a person's own receptionist mode overrides the workspace policy", () => {
  const routed = { replyMode: "auto" };
  assert.equal(
    effectiveReplyMode(routed, "never"),
    "never",
    "Never for a difficult customer silences the bot for them",
  );
  assert.equal(effectiveReplyMode(routed, "ask"), "ask");
  assert.equal(
    effectiveReplyMode({ replyMode: "ask" }, "auto"),
    "auto",
    "and can unmute one person in a timid workspace",
  );
});

test("no person setting changes nothing", () => {
  assert.equal(effectiveReplyMode({ replyMode: "veto" }, null), "veto");
  assert.equal(effectiveReplyMode({ replyMode: "auto" }, undefined), "auto");
  assert.equal(effectiveReplyMode({ replyMode: "ask" }, ""), "ask");
});
