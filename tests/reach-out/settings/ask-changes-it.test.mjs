/**
 * Ask changes How it reaches out by a card (decision 0113): each op judged by the one change schema, applied to the
 * config's reach_out section as the page's own folds write it, said in the card's one line, and opened on its row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AskSettingsChangeSchema,
  applySettingsChange,
  describeSettingsChange,
  REACH_OUT_LIMITS,
} from "@chanlytics/contracts";

const config = { brain: { business_name: "Brightline" }, reach_out: { proof: ["We clean 40 clinics."] } };

test("an offer set, then emptied: the key written, then taken away with the section", () => {
  const set = applySettingsChange({ brain: {} }, { op: "set_offer", offer: "  Evening cleaning  " });
  assert.deepEqual(set.reach_out, { offer: "Evening cleaning" });
  const cleared = applySettingsChange(set, { op: "set_offer", offer: "" });
  assert.equal(cleared.reach_out, undefined);
  assert.equal(JSON.parse(JSON.stringify(cleared)).reach_out, undefined, "saved, it is left out");
});

test("a claim added once, never twice, and taken away by its words", () => {
  const added = applySettingsChange(config, { op: "add_claim", claim: "Every cleaner is insured." });
  assert.deepEqual(added.reach_out.proof, ["We clean 40 clinics.", "Every cleaner is insured."]);
  assert.deepEqual(applySettingsChange(added, { op: "add_claim", claim: "We clean 40 clinics." }).reach_out.proof, [
    "We clean 40 clinics.",
    "Every cleaner is insured.",
  ]);
  assert.deepEqual(applySettingsChange(added, { op: "remove_claim", claim: "We clean 40 clinics." }).reach_out.proof, [
    "Every cleaner is insured.",
  ]);
  assert.deepEqual(applySettingsChange(config, { op: "set_signed_by", name: "Maya" }).brain, config.brain);
});

test("the booking link, what an answer offered before the page, is stored as nothing", () => {
  const call = applySettingsChange(config, { op: "set_reply_offer", offer: "call" });
  assert.equal(call.reach_out.reply_offer, "call");
  assert.equal(
    "reply_offer" in applySettingsChange(call, { op: "set_reply_offer", offer: "booking_link" }).reach_out,
    false,
  );
});

test("the schema holds each op to the section's limits", () => {
  assert.equal(
    AskSettingsChangeSchema.safeParse({ op: "add_claim", claim: "x".repeat(REACH_OUT_LIMITS.claim + 1) }).success,
    false,
  );
  assert.equal(AskSettingsChangeSchema.safeParse({ op: "set_reply_offer", offer: "fax" }).success, false);
  assert.equal(AskSettingsChangeSchema.safeParse({ op: "set_cold_tone", tone: "Direct" }).success, true);
});

test("the card says what it changes in the page's words", () => {
  assert.equal(
    describeSettingsChange({ op: "set_offer", offer: "Evening cleaning" }),
    "What you offer: “Evening cleaning”",
  );
  assert.equal(
    describeSettingsChange({ op: "set_reply_offer", offer: "call" }),
    "An answer to a lead offers a call with you",
  );
});
