/**
 * How it reaches out's folds (decision 0113), through the business tab's own save: every fold the save file knows that
 * writes the config's reach_out section has a real change here, which lands on its one key and leaves the rest of the
 * config exactly as it was; an emptied box takes its key away, and the section with its last key; a fold opened and
 * saved with no change writes nothing. The receptionist's folds are held the same way in
 * tests/receptionist/business-tab/business-tab-folds.test.mjs, so between the two files no fold arrives unproven.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { unmount } from "../../_stub-react.mjs";
import "../../_business-tab-harness.mjs";

after(() => unmount());

const S = globalThis.window.__businessTabSave;

/** A stored config with every key of the section set, beside a brain and another section no fold here may touch. */
const STORED = {
  brain: { business_name: "Brightline Cleaning", profile: { tone: "Warm", a_key_no_form_renders: "keep me" } },
  notifications: { email: true },
  reach_out: {
    offer: "Evening cleaning for clinics.",
    who_for: "Dental offices",
    fixes: "The mess a day leaves",
    proof: ["We clean 40 clinics across Austin today."],
    tone: "Direct",
    signed_by: "Maya",
    signature: "Maya Ortiz\nOwner",
    phone: "(512) 555-0142",
    reply_offer: "call",
  },
};
const stored = () => structuredClone(STORED);

/** Each fold's key of the section, its change from the draft it opens with, and what the change stores. */
const EDITS = {
  offer: ["offer", () => "  Overnight cleaning for clinics. ", "Overnight cleaning for clinics."],
  who_for: ["who_for", () => "Vet clinics", "Vet clinics"],
  fixes: ["fixes", () => "Floors nobody has time for", "Floors nobody has time for"],
  proof: [
    "proof",
    (d) => [...d, "  ", " Every cleaner is insured. "],
    ["We clean 40 clinics across Austin today.", "Every cleaner is insured."],
  ],
  cold_tone: ["tone", () => "Plain and short.", "Plain and short."],
  signed_by: ["signed_by", () => "Sam", "Sam"],
  signature: ["signature", () => "Sam Ortiz\nOwner", "Sam Ortiz\nOwner"],
  sign_phone: ["phone", () => "(512) 555-0199", "(512) 555-0199"],
  reply_offer: ["reply_offer", () => "answer", "answer"],
};
const FOLDS = Object.keys(EDITS);

/** A config with one key of the section taken out, and the section with it once nothing is left in it. */
const without = (config, key) => {
  const c = structuredClone(config);
  if (c.reach_out) delete c.reach_out[key];
  if (c.reach_out && !Object.keys(c.reach_out).length) delete c.reach_out;
  return c;
};

test("every fold that writes the section has its change here, and owns its one key and nothing of the brain", () => {
  const section = Object.keys(S.PATHS_OF).filter((f) => S.PATHS_OF[f].some((p) => p.startsWith("reach_out.")));
  assert.deepEqual(section.sort(), [...FOLDS].sort());
  for (const fold of FOLDS) {
    assert.deepEqual(S.PATHS_OF[fold], [`reach_out.${EDITS[fold][0]}`], fold);
    assert.deepEqual(S.KEYS_OF[fold], [], `${fold} writes no key of the receptionist's profile`);
  }
});

for (const fold of FOLDS) {
  const [key, edit, kept] = EDITS[fold];

  test(`the ${fold} fold writes its key, and leaves everything else in the config exactly as it was`, () => {
    const handed = stored();
    const next = S.saveFold(fold, handed, edit(S.draftOf(fold, handed)));
    assert.deepEqual(handed, STORED, "the config it was handed is as it was");
    assert.deepEqual(next.reach_out[key], kept);
    assert.deepEqual(without(next, key), without(STORED, key));
  });

  test(`the ${fold} fold, opened and saved with no change, writes nothing new`, () => {
    const next = S.saveFold(fold, stored(), S.draftOf(fold, stored()));
    assert.deepEqual(next, STORED);
    assert.ok(S.same(next, STORED), `${fold}: the saver would send a save that changes nothing`);
  });

  test(`the ${fold} fold, emptied, takes its key away`, () => {
    const emptied = fold === "proof" ? [" "] : fold === "reply_offer" ? "booking_link" : " ";
    const next = S.saveFold(fold, stored(), emptied);
    assert.equal(key in next.reach_out, false);
    assert.deepEqual(next, without(STORED, key));
  });
}

test("the section goes with its last key, and the brain stays", () => {
  const next = S.saveFold("offer", { brain: STORED.brain, reach_out: { offer: "A" } }, "");
  assert.equal("reach_out" in next, false);
  assert.deepEqual(next.brain, STORED.brain);
});

test("a fold opens on what the section holds, never on what a writer reads in its place", () => {
  // The receptionist's tone is what a cold email reads with no tone of its own; opened on it, a save would store it as
  // the owner's words for cold email.
  const bare = { brain: STORED.brain };
  for (const fold of FOLDS) assert.deepEqual(S.draftOf(fold, bare), fold === "proof" ? [] : "", fold);
});

test("the phone's fold refuses words that are no phone number, under its box", () => {
  assert.deepEqual(S.problemsOf("sign_phone", "call me"), {
    sign_phone: "A phone number, as people write one: its digits, with spaces, dashes or brackets.",
  });
  assert.deepEqual(S.problemsOf("sign_phone", "(512) 555-0142"), {});
});
