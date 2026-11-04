/**
 * Whether a message is a one-time code is read by one reader on every wire (contracts lines/one-time-code.ts), the one the
 * texting door asks. The receptionist's verb kept a looser one of its own until 3 Nov 2026, so on WhatsApp a customer who
 * mentioned a code of theirs was set aside and never answered, and a code a service sent in its own shape was answered.
 * tests/sms/one-time-code.test.mjs holds the reader's words; this holds that the verb asks it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { text, world } from "./_world.mjs";

const meta = { intent: "other", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };

/** Customers the verb's old reader set aside on WhatsApp: the door's reader answers them. */
const CUSTOMERS = [
  "Hi! Your security code is 4512.",
  "Hi, the building security code is 4512 - don't share it with anyone",
  "Use 4512 to sign in at the front desk, don't share it",
  "4512 is your access code",
];
/** Codes in a sender's own shape the verb's old reader answered. */
const CODES = ["Your Apple ID Code is: 123456. Don't share it with anyone.", "Your Signal verification code: 123-456"];

test("a customer who mentions a code of their own is answered on WhatsApp, as a text is", async () => {
  for (const [i, body] of CUSTOMERS.entries()) {
    let asked = 0;
    const w = world({ env: { modelKey: "k" } });
    await w.run(text(body, `wamid.c${i}`), {
      brain: async () => ({ generateReply: async () => ((asked += 1), { text: "Thanks!", escalate: false, meta }) }),
    });
    assert.equal(asked, 1, `${body}: the receptionist was asked`);
  }
});

test("a code a service sent is recorded and set aside on WhatsApp, as a text's door sets it aside", async () => {
  for (const [i, body] of CODES.entries()) {
    const w = world({ env: { modelKey: "k" } });
    await w.run(text(body, `wamid.k${i}`));
    assert.equal(w.seen.sent.length, 0, `${body}: nothing is sent`);
    assert.equal(w.seen.processed, 1, `${body}: recorded and handled`);
    assert.equal(w.seen.escalations.length, 0, `${body}: nobody is asked about a service's code`);
  }
});
