/**
 * A number Ask writes about the owner's business stands only where the owner said it (decision 0113): in one of the
 * claims on How it reaches out, or in the business's name. The words the owner types are theirs and are never judged
 * for it. A number that is a time ("a 10-minute walkthrough", "9:30") claims nothing, and a slot's number is the slot's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { leadEmail } = await import("../../../apps/dashboard/src/server/campaigns/sequences/draft-judge.ts");
const { unbackedNumbers } = await import("../../../apps/dashboard/src/server/campaigns/sequences/numbers.ts");

test("a number nothing backs is named, once, as written", () => {
  assert.deepEqual(unbackedNumbers("We clean 40 clinics and 1,204 rooms, 1,204 a week", ["We clean 40 clinics"]), [
    "1,204",
  ]);
});

test("a number backed in another form is backed", () => {
  assert.deepEqual(unbackedNumbers("4.9 stars, 1204 rooms", ["4.90 out of 5", "1,204 rooms a month"]), []);
});

test("a time claims nothing", () => {
  assert.deepEqual(unbackedNumbers("Worth a 10-minute walkthrough at 9:30, or a 15 min call next week?", []), []);
  assert.deepEqual(unbackedNumbers("Free in 2 weeks, or 3 days from now", []), []);
});

test("a slot's number is the slot's, never the words'", () => {
  assert.deepEqual(unbackedNumbers("{{opening}}\n{{business}} in {{city}}", []), []);
  assert.deepEqual(unbackedNumbers("{{opening}}\nWe clean 40 clinics", []), ["40"]);
});

test("a step Ask drafted with a number no claim backs is left for the owner to write", () => {
  const words = {
    subject: "Evening cleaning",
    body: "{{opening}}\n\nWe clean 40 clinics across Austin. Worth a call?",
  };
  assert.equal(leadEmail(words, true, []).body, "");
  assert.equal(leadEmail(words, true, ["We clean 40 clinics across Austin."]).body, words.body);
});
