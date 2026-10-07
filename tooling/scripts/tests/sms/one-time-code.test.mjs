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
  ["Your iCloud code is 4829. Don't share it.", { code: "4829", from: "iCloud" }],
  ["Use 482913 to verify your account. Do not share this code with anyone.", { code: "482913", from: null }],
  ["Your verification code is 123456. Don't share it with anyone.", { code: "123456", from: null }],
  // What WhatsApp sends an Android phone: the retriever's mark, a link holding the code again, and the warning.
  [
    "<#> Your WhatsApp code: 788-963\nYou can also tap on this link to verify your phone: v.whatsapp.com/788963\nDon't share this code with others\n4sgLq1p5sV6",
    { code: "788-963", from: "WhatsApp" },
  ],
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
  // A gate, a door, a lockbox or an alarm shared with the warning and an everyday word that a sender's text also uses
  // (confirm, security, sign in): the words of a code, never a sender's shape (the final review of 6 October found each).
  "The gate code is 4512, don't share it with anyone. Please confirm you got this.",
  "Door code is 8821, never share it. I'll confirm the arrival time tomorrow.",
  "Lockbox code: 4512. Don't share this. Confirming 9am Thursday.",
  "Hi, the building security code is 4512 - don't share it with anyone",
  "Parking code 4512, don't share it. Sign in at the front desk.",
  "Use 4512 to open the gate, don't share it",
  // The business's own promotion, named back to it: a name and a code, and the customer's sentence goes on.
  "Hi it's Ana. Your Rewards code 123456 doesn't work",
  "I tried your Summer code 2024 and it said invalid",
  "Your Rewards code 123456 doesn't work, don't share it with them",
  // An access, alarm or booking code given to the business in a sender's very words: security, access and confirmation
  // are a customer's kinds too, so they are no sender's sign without a sender's name and the warning.
  "Your access code is 4512, don't share it with anyone.",
  "Hi! Your security code is 4512.",
  "Your ADT security code is 4512.",
  "Your confirmation code is 4512. Don't share it.",
  "4512 is your access code",
  "Your Airbnb access code is 4512, don't share it",
  "Enter 4512 to confirm the gate opens, never share it",
  "Use 4512 to sign in at the front desk, don't share it",
];

/** A sender's shape with no sign of a sender beside it (no kind of code named, no warning): a customer writes these too. */
const BARE = ["Your iCloud code is 4829", "Your WhatsApp code: 788-963", "Your Rewards code is 123456."];

test("a code is read from the shapes senders write it in, with the name it read and the code as it was written", () => {
  for (const [body, want] of CODES) assert.deepEqual(oneTimeCodeOf(body), want, JSON.stringify(body));
});

test("a customer's text is never taken for a code: a door code, a question, a street number, a price, a phone number, a shared secret", () => {
  for (const body of CUSTOMERS) assert.equal(oneTimeCodeOf(body), null, JSON.stringify(body));
});

test("a sender's shape alone is not enough: with no kind of code named and no warning not to share it, it is left to be answered as it was", () => {
  for (const body of BARE) assert.equal(oneTimeCodeOf(body), null, JSON.stringify(body));
});

test("a long text is not a code, however it begins; a code with a letter or more digits against it is not a code", () => {
  assert.equal(oneTimeCodeOf(`${"x".repeat(320)} Your WhatsApp code: 788-963`), null);
  assert.deepEqual(
    oneTimeCodeOf(`Your WhatsApp code: 788-963\n\nDon't share this code with others. ${"x".repeat(200)}`)?.code,
    "788-963",
    "a long one is still short enough",
  );
  assert.equal(oneTimeCodeOf("Your WhatsApp code: 788963a. Don't share it."), null, "a letter against it");
  assert.equal(oneTimeCodeOf("Your WhatsApp code: 123456789. Don't share it."), null, "nine digits are not a code");
  assert.equal(oneTimeCodeOf("Your WhatsApp code: 78. Don't share it."), null, "two are not either");
  assert.deepEqual(
    oneTimeCodeOf("Your WhatsApp code: 78896. Don't share it."),
    { code: "78896", from: "WhatsApp" },
    "five are",
  );
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
  const meta = "Your WhatsApp code: 788-963\n\nDon't share this code with others";
  assert.equal(lineCodesFrom([text(meta, 15 * MIN)], NOW).length, 1, "fifteen minutes is within");
  assert.equal(lineCodesFrom([text(meta, 15 * MIN + 1)], NOW).length, 0, "and a millisecond more is not");
});
