/**
 * How a call ended, decided once (decision 0092, contracts voice/call-endings.ts). The provider's endings were spelled in
 * three lists that had drifted apart: the owner's labels had no word for the provider's credit running out or any
 * error, the Health page's words and its "ours to mend" notes held eleven, and Today's calls worth an ear four. They are
 * now one table, and these hold it: every ending the provider names has its words, its owner and its page; the platform's
 * own endings page and are never said to an owner in the provider's terms; the old lists read the same words they did;
 * an ending the provider adds is said in plain words and, as an error, pages.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALL_ENDINGS,
  CALL_ENDING_MENDS,
  CALL_ENDING_PLATFORM_WORDS,
  CALL_ENDINGS_NEEDING_AN_EAR,
  callEndingOf,
  DISCONNECTION_LABELS,
  isCallEndingReason,
} from "@chanlytics/contracts";

/**
 * Every ending the voice provider's call object names (its reference, October 2026), the two Live's own controls make,
 * and the one production met that the reference does not list (credit_exhausted, 6 October 2026). A reason added here
 * without its row in the table fails the first test: give it words, an owner and a page.
 */
const PROVIDER_ENDINGS = [
  "user_hangup",
  "agent_hangup",
  "call_transfer",
  "transfer_bridged",
  "transfer_cancelled",
  "voicemail_reached",
  "machine_detected",
  "ivr_reached",
  "inactivity",
  "max_duration_reached",
  "concurrency_limit_reached",
  "no_valid_payment",
  "scam_detected",
  "error_inbound_webhook",
  "dial_busy",
  "dial_failed",
  "dial_no_answer",
  "error_llm_websocket_open",
  "error_llm_websocket_lost_connection",
  "error_llm_websocket_runtime",
  "error_llm_websocket_corrupt_payload",
  "error_frontend_corrupted_payload",
  "error_twilio",
  "error_no_audio_received",
  "error_asr",
  "error_retell",
  "error_unknown",
  "error_user_not_joined",
  "registered_call_timeout",
  "marked_as_spam",
  "user_declined",
  "manual_stopped",
  "call_take_over",
  "credit_exhausted",
];

test("every ending the provider names has its row: words for the owner and the platform, whose it is, and whether it pages", () => {
  for (const reason of PROVIDER_ENDINGS) {
    assert.ok(isCallEndingReason(reason), `${reason} has no row in CALL_ENDINGS`);
    const e = CALL_ENDINGS[reason];
    assert.ok(e.owner.trim() && e.platform.trim(), `${reason}: words for both`);
    assert.ok(["caller", "business", "platform"].includes(e.whose), `${reason}: whose`);
    assert.equal(typeof e.needsEar, "boolean");
    assert.equal(typeof e.pages, "boolean");
  }
  assert.deepEqual(Object.keys(CALL_ENDINGS).sort(), [...PROVIDER_ENDINGS].sort(), "and the table holds no other");
});

test("the platform's endings page and say what mends them; nobody else's does; an owner never reads the provider's account", () => {
  for (const [reason, e] of Object.entries(CALL_ENDINGS)) {
    assert.equal(e.pages, e.whose === "platform", `${reason}: only the platform's endings page`);
    if (e.whose !== "platform") continue;
    assert.ok(CALL_ENDING_MENDS[reason], `${reason}: what mends it`);
    assert.doesNotMatch(
      e.owner,
      /credit|payment|provider|webhook|retell|twilio/i,
      `${reason}: the owner's words are ours`,
    );
  }
  assert.ok(CALL_ENDINGS.error_inbound_webhook.pages, "our own inbound webhook failing a call pages");
  assert.ok(CALL_ENDINGS.credit_exhausted.pages, "the provider's credit running out pages");
});

test("the three lists read the same words they did before the table", () => {
  const before = {
    user_hangup: "Customer hung up",
    agent_hangup: "Receptionist ended the call",
    call_transfer: "Transferred to a person",
    voicemail_reached: "Reached voicemail",
    dial_no_answer: "No answer",
    dial_busy: "Line was busy",
    dial_failed: "Call couldn't connect",
    inactivity: "Ended after silence",
    max_duration_reached: "Hit the call length limit",
    concurrency_limit_reached: "Line was busy — all agents in use",
    user_declined: "Customer declined the call",
    marked_as_spam: "Flagged as spam by the carrier",
    manual_stopped: "Ended from the dashboard",
    call_take_over: "A person took over the call",
    transfer_bridged: "Transferred to a person",
    transfer_cancelled: "Transfer did not go through",
  };
  for (const [reason, words] of Object.entries(before)) assert.equal(DISCONNECTION_LABELS[reason], words, reason);
  for (const [reason, words] of Object.entries({
    user_hangup: "hung up",
    dial_no_answer: "nobody answered",
    credit_exhausted: "the voice provider's credit ran out",
    error_unknown: "an error the provider didn't name",
    concurrency_limit_reached: "too many calls at once",
  }))
    assert.equal(CALL_ENDING_PLATFORM_WORDS[reason], words, reason);
  for (const reason of ["dial_no_answer", "inactivity", "concurrency_limit_reached", "marked_as_spam"])
    assert.ok(CALL_ENDINGS_NEEDING_AN_EAR.includes(reason), `${reason} is still a call worth an ear`);
  assert.ok(!CALL_ENDINGS_NEEDING_AN_EAR.includes("user_hangup"), "every ordinary call ends that way");
});

test("an ending the provider adds is said in plain words, never its code, and pages when it is an error", () => {
  assert.equal(callEndingOf(null), null);
  assert.equal(callEndingOf(""), null);
  const err = callEndingOf("error_new_thing");
  assert.equal(err?.whose, "platform");
  assert.equal(err?.pages, true);
  const other = callEndingOf("caller_walked_away");
  assert.deepEqual([other?.owner, other?.whose, other?.pages], ["Caller walked away", "caller", false]);
});
