/**
 * A one-time code texted to a line (channels lines/sms.ts `oneTimeCodeOf`), over the bodies senders write: the two
 * Meta sent the Chanlytics workspace's own line on 6 October 2026 (the real bodies; the numbers they came from are
 * Meta's and are not in any test), the shapes other services use, and what a customer could write that must never be
 * taken for one -- a text taken for a code is never answered and never becomes a person, so every negative here is a
 * customer who would be silenced. Then `lineCodesFrom`: the provider's own record of a number's texts, narrowed to what an
 * owner is waiting for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { oneTimeCodeOf, lineCodesFrom } from "@chanlytics/channels";

const CODES = [
  // The two Meta texts of 6 October (12:08 and 12:34 UTC): ordinary long numbers, no short code.
  ["Your WhatsApp code: 788-963\n\nDon't share this code with others", { code: "788-963", from: "WhatsApp" }],
  ["Your WhatsApp code: 353-343\n\nDon't share this code with others", { code: "353-343", from: "WhatsApp" }],
  // What other services write.
  ["G-123456 is your Google verification code.", { code: "123456", from: "Google" }],
  ["123 456 is your Instagram code. Don't share it.", { code: "123 456", from: "Instagram" }],
  ["Your Apple ID Code is: 123456. Don't share it with anyone.", { code: "123456", from: "Apple ID" }],
  ["<#> 482913 is your code", { code: "482913", from: null }],
  ["123456 is your verification code", { code: "123456", from: null }],
  ["PayPal: 123456 is your security code. Don't share your code.", { code: "123456", from: null }],
  ["Your Chase one-time code is 482913. Never share it.", { code: "482913", from: "Chase" }],
  ["Your Signal verification code: 123-456", { code: "123-456", from: "Signal" }],
  ["Your iCloud code is 4829", { code: "4829", from: "iCloud" }],
  ["Use 482913 to verify your account. Do not share this code with anyone.", { code: "482913", from: null }],
];

const CUSTOMERS = [
  "my door code is 4512",
  "Can you send me the code?",
  "Booking for 2 at 4512 Main St, code word blue",
  "your code didn't work, I paid 1234 dollars",
  "Your door code is 4512",
  "Your Door code is 4512",
  "Your Booking code is 4512",
  "Is your Gate code 4512?",
  "hi, the code is 4512 and please don't share it",
  "the gate code is 4512, don't share it with anyone",
  "Call me on 555-0142 about the code",
  "Don't share this code, I paid 1234 and 5678",
  "Your code is 4512",
  "Are you open Saturday?",
  "STOP",
  "",
];

test("a code is read from the shapes senders write it in, with the name it read and the code as it was written", () => {
  for (const [body, want] of CODES) assert.deepEqual(oneTimeCodeOf(body), want, JSON.stringify(body));
});

test("a customer's text is never taken for a code: a door code, a question, a street number, a price, a phone number, a shared secret", () => {
  for (const body of CUSTOMERS) assert.equal(oneTimeCodeOf(body), null, JSON.stringify(body));
});

test("a long text is not a code, however it begins; a code with a letter or more digits against it is not a code", () => {
  assert.equal(oneTimeCodeOf(`${"x".repeat(320)} Your WhatsApp code: 788-963`), null);
  assert.deepEqual(
    oneTimeCodeOf(`Your WhatsApp code: 788-963 ${"x".repeat(200)}`)?.code,
    "788-963",
    "a long one is still short enough",
  );
  assert.equal(oneTimeCodeOf("Your WhatsApp code: 788963a"), null, "a letter against it");
  assert.equal(oneTimeCodeOf("Your WhatsApp code: 123456789"), null, "nine digits are not a code");
  assert.equal(oneTimeCodeOf("Your WhatsApp code: 78"), null, "two are not either");
  assert.deepEqual(oneTimeCodeOf("Your WhatsApp code: 78896"), { code: "78896", from: "WhatsApp" }, "five are");
});

const NOW = Date.parse("2026-10-06T15:00:00Z");
const MIN = 60_000;
const text = (body, agoMs, over = {}) => ({
  sid: `SM${agoMs}`,
  from: "+15555550100",
  body,
  atMs: NOW - agoMs,
  ...over,
});

test("the line's codes are the ones in the last fifteen minutes, newest first, at most three, each with the time the provider says it was sent", () => {
  const texts = [
    text("Are you open Saturday?", 1 * MIN),
    text("Your WhatsApp code: 788-963\n\nDon't share this code with others", 2 * MIN),
    text("G-123456 is your Google verification code.", 5 * MIN),
    text("123 456 is your Instagram code. Don't share it.", 9 * MIN),
    text("Your Apple ID Code is: 123456. Don't share it with anyone.", 12 * MIN),
    text("<#> 482913 is your code", 16 * MIN),
  ];
  assert.deepEqual(lineCodesFrom(texts, NOW), [
    { code: "788-963", from: "WhatsApp", at: "2026-10-06T14:58:00.000Z" },
    { code: "123456", from: "Google", at: "2026-10-06T14:55:00.000Z" },
    { code: "123 456", from: "Instagram", at: "2026-10-06T14:51:00.000Z" },
  ]);
  assert.deepEqual(
    lineCodesFrom([...texts].reverse(), NOW).map((c) => c.code),
    ["788-963", "123456", "123 456"],
    "newest first, whatever order the provider listed them in",
  );
  assert.deepEqual(lineCodesFrom([], NOW), []);
  assert.deepEqual(lineCodesFrom([text("Are you open Saturday?", MIN)], NOW), [], "no code, none");
  assert.equal(
    lineCodesFrom([text("Your WhatsApp code: 788-963", 15 * MIN)], NOW).length,
    1,
    "fifteen minutes is within",
  );
  assert.equal(
    lineCodesFrom([text("Your WhatsApp code: 788-963", 15 * MIN + 1)], NOW).length,
    0,
    "and a millisecond more is not",
  );
});
