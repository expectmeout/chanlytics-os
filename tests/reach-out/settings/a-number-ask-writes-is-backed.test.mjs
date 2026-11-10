/**
 * A number Ask writes about the owner's business stands only where the owner said it (decision 0113): in one of the
 * claims on Cold email, or in the business's name. The words the owner types are theirs and are never judged
 * for it. A number that is a time ("a 10-minute walkthrough", "9:30") claims nothing, and a slot's number is the slot's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { draftBackingOf, leadEmail } =
  await import("../../../apps/dashboard/src/server/campaigns/sequences/draft-judge.ts");
const { numberBacking, unbackedNumbers } =
  await import("../../../apps/dashboard/src/server/campaigns/sequences/numbers.ts");

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

test("what the owner typed into New backs a number Ask repeats from it, as a claim does", () => {
  const known = { business: "Brightline Cleaning", proof: ["We clean 40 clinics across Austin today."] };
  const ask = { words: "Mention we've cleaned offices for 12 years" };
  assert.deepEqual(draftBackingOf(known, ask), [
    "We clean 40 clinics across Austin today.",
    "Brightline Cleaning",
    "Mention we've cleaned offices for 12 years",
  ]);
  const step = { subject: "Evening cleaning", body: "{{opening}}\n\n12 years of night shifts, and 40 clinics today." };
  assert.equal(leadEmail(step, true, draftBackingOf(known, ask)).body, step.body);
  // Without the owner's line, the 12 is nobody's: the step is left for the owner to write.
  assert.equal(leadEmail(step, true, draftBackingOf(known, { words: "Email the clinics" })).body, "");
});

test("what backs a number is one list: the claims, the business's name, and what this writing was asked from", () => {
  assert.deepEqual(
    numberBacking([" We clean 40 clinics. ", " "], "Brightline", ["Mention 12 years", "", null, undefined]),
    ["We clean 40 clinics.", "Brightline", "Mention 12 years"],
  );
  assert.deepEqual(numberBacking(undefined, "Brightline"), ["Brightline"]);
});
