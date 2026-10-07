/**
 * The sign-in page's rules, executed: what a failed code request says, what
 * a failed verification says, and how long "Resend code" waits.
 *
 * These lived in the page, where nothing ran them, and one mail failure had
 * two translations: the sign-up page said "we could not send your code" and
 * the sign-in page said "too many requests", of the same budget. The words
 * are in contracts now, and the page only shows them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIGNIN_RESEND_COOLDOWN_S,
  SIGNUP_WORDS,
  requestCodeWords,
  resendLeft,
  verifyCodeWords,
} from "@chanlytics/contracts";

test("a code request: the person's own wait is told in seconds; our mail failure is said as sign-up says it; a limit without a wait is a minute; the oracle stays closed; an outage still surfaces", () => {
  assert.equal(
    requestCodeWords({
      message: "For security purposes, you can only request this after 37 seconds.",
      code: "over_email_send_rate_limit",
      status: 429,
    }),
    "Please wait 37s before requesting another code.",
  );
  assert.equal(
    requestCodeWords({ message: "Email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 }),
    SIGNUP_WORDS.notSent,
    "the project's mail budget is ours, and says so",
  );
  assert.equal(
    requestCodeWords({ message: "Error sending confirmation email", code: "email_provider_disabled", status: 500 }),
    SIGNUP_WORDS.notSent,
    "the provider is ours too",
  );
  assert.equal(requestCodeWords({ message: "Request rate limit reached", status: 429 }), SIGNUP_WORDS.notSent);
  assert.equal(
    requestCodeWords({ message: "Too many requests", status: 400 }),
    SIGNUP_WORDS.notSent,
    '"too many requests" of the mail is the budget: ours, by the same judgement sign-up makes',
  );
  assert.equal(
    requestCodeWords({ message: "Too many attempts", status: 400 }),
    "Too many requests just now — wait a minute and try again.",
    "a burst that is neither a wait nor the mail: a minute",
  );
  for (const message of [
    "Signups not allowed for otp",
    "otp_disabled",
    "Email not found",
    "Invalid login credentials",
  ]) {
    assert.equal(
      requestCodeWords({ message, status: 422 }),
      null,
      `${JSON.stringify(message)} is swallowed: a code was sent, as far as anyone outside the inbox can tell`,
    );
  }
  assert.equal(
    requestCodeWords({ message: "fetch failed", status: 0 }),
    "fetch failed",
    "a genuine outage is shown as it is",
  );
  assert.equal(requestCodeWords(null), null);
  assert.equal(requestCodeWords({ message: "" }), null);
});

test("a verification: a wrong or old code in one sentence, a burst of tries in another, anything else as it is", () => {
  assert.equal(
    verifyCodeWords("Token has expired or is invalid"),
    "That code didn't match or has expired — request a new one.",
  );
  assert.equal(verifyCodeWords("Invalid otp"), "That code didn't match or has expired — request a new one.");
  assert.equal(
    verifyCodeWords("For security purposes, you can only request this after 9 seconds."),
    "Too many attempts — wait a minute before trying again.",
  );
  assert.equal(verifyCodeWords("Database error"), "Database error");
});

test("the resend wait counts from when the code went: sixty seconds, whole seconds up, zero once passed, zero when nothing was sent", () => {
  const sent = Date.parse("2026-09-11T12:00:00Z");
  assert.equal(SIGNIN_RESEND_COOLDOWN_S, 60);
  assert.equal(resendLeft(sent, sent), 60);
  assert.equal(resendLeft(sent, sent + 1_500), 59, "a fraction of a second still counts as a second to wait");
  assert.equal(resendLeft(sent, sent + 59_999), 1);
  assert.equal(resendLeft(sent, sent + 60_000), 0);
  assert.equal(resendLeft(sent, sent + 3_600_000), 0, "a tab that slept counts what really passed");
  assert.equal(resendLeft(null, sent), 0);
  assert.equal(resendLeft(sent, sent + 10_000, 30), 20, "the page may ask for its own length");
});
