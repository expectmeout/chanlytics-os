/**
 * How it reaches out's folds (decision 0113), through the business tab's own save: every fold the save file knows that
 * writes the config's reach_out section has a real change here, which lands on its one key and leaves the rest of the
 * config exactly as it was; an emptied box takes its key away, and the section with its last key; a fold opened and
 * saved with no change writes nothing. The receptionist's folds are held the same way in
 * tests/receptionist/business-tab/business-tab-folds.test.mjs, so between the two files no fold arrives unproven.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { applySettingsChange } from "@chanlytics/contracts";
import { unmount } from "../../_stub-react.mjs";
import "../../_business-tab-harness.mjs";
import {
  paneOfRow,
  settingsRowOf,
  settingsRowRoute,
} from "../../../apps/dashboard/src/surfaces/settings/frame/tabs.ts";

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
  sound: ["tone", () => "Plain and short.", "Plain and short."],
  reply_offer: ["reply_offer", () => "answer", "answer"],
};
const FOLDS = Object.keys(EDITS);
/** The one fold that writes three keys: how an email ends, one row and one sheet. */
const ENDING_KEYS = ["signed_by", "signature", "phone"];

/** A config with one key of the section taken out, and the section with it once nothing is left in it. */
const without = (config, key) => {
  const c = structuredClone(config);
  if (c.reach_out) delete c.reach_out[key];
  if (c.reach_out && !Object.keys(c.reach_out).length) delete c.reach_out;
  return c;
};

test("every fold that writes the section has its change here, and owns its one key and nothing of the brain", () => {
  const section = Object.keys(S.PATHS_OF).filter((f) => S.PATHS_OF[f].some((p) => p.startsWith("reach_out.")));
  assert.deepEqual(section.sort(), [...FOLDS, "ending"].sort());
  assert.deepEqual(
    S.PATHS_OF.ending,
    ENDING_KEYS.map((k) => `reach_out.${k}`),
  );
  assert.deepEqual(S.KEYS_OF.ending, []);
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

test("the ending opens on the three keys it writes, and saved with no change writes nothing", () => {
  assert.deepEqual(S.draftOf("ending", stored()), {
    signed_by: "Maya",
    signature: "Maya Ortiz\nOwner",
    phone: "(512) 555-0142",
  });
  const next = S.saveFold("ending", stored(), S.draftOf("ending", stored()));
  assert.deepEqual(next, STORED);
  assert.ok(S.same(next, STORED), "the saver would send a save that changes nothing");
  assert.equal(S.holdsChanges("ending", stored(), S.draftOf("ending", stored())), false);
});

test("a change to one of the ending's boxes writes that key alone", () => {
  for (const key of ENDING_KEYS) {
    const handed = stored();
    const draft = { ...S.draftOf("ending", handed), [key]: "  Sam  " };
    const next = S.saveFold("ending", handed, draft);
    assert.deepEqual(handed, STORED, "the config it was handed is as it was");
    assert.equal(next.reach_out[key], "Sam", key);
    assert.deepEqual(without(next, key), without(STORED, key), key);
  }
});

test("the ending's emptied boxes take their keys away, and the section goes with its last", () => {
  const emptied = { signed_by: " ", signature: "", phone: "  " };
  const next = S.saveFold("ending", stored(), emptied);
  for (const key of ENDING_KEYS) assert.equal(key in next.reach_out, false, key);
  assert.equal(next.reach_out.offer, STORED.reach_out.offer, "what else the section holds stays");
  const last = { brain: STORED.brain, reach_out: { signed_by: "Maya" } };
  assert.equal("reach_out" in S.saveFold("ending", last, emptied), false);
});

test("a refusal of the ending is said under the box it is about", () => {
  const good = { signed_by: "Maya", signature: "", phone: "" };
  assert.deepEqual(S.saveProblems("ending", {}, { ...good, phone: "call me" }), {
    phone: "A phone number, as people write one: its digits, with spaces, dashes or brackets.",
  });
  assert.deepEqual(Object.keys(S.saveProblems("ending", {}, { ...good, signature: "Maya\nbrightline.example.com" })), [
    "signature",
  ]);
  assert.deepEqual(Object.keys(S.saveProblems("ending", {}, { ...good, signed_by: "x".repeat(61) })), ["signed_by"]);
  assert.deepEqual(S.saveProblems("ending", {}, good), {});
});

test("the section goes with its last key, and the brain stays", () => {
  const next = S.saveFold("offer", { brain: STORED.brain, reach_out: { offer: "A" } }, "");
  assert.equal("reach_out" in next, false);
  assert.deepEqual(next.brain, STORED.brain);
});

test("a fold's draft is what the section holds, never what a writer reads in its place", () => {
  // The receptionist's tone is what a cold email reads with no tone of its own. The page's box opens on it (the-page.test),
  // and the save is judged against this: it stores those words only once they are changed.
  const bare = { brain: STORED.brain };
  for (const fold of FOLDS) assert.deepEqual(S.draftOf(fold, bare), fold === "proof" ? [] : "", fold);
});

test("a box refuses what the save refuses, under its own field, in the save's sentence", () => {
  assert.deepEqual(S.saveProblems("offer", {}, "x".repeat(2001)), { offer: "Keep it under 2,000 characters." });
});

test("a claim's refusal is said under the row it was typed in, with an empty row above it", () => {
  assert.deepEqual(S.saveProblems("proof", {}, ["", "x".repeat(201)]), { "claim-1": "Keep it under 200 characters." });
  assert.deepEqual(
    S.saveProblems(
      "proof",
      {},
      Array.from({ length: 11 }, (_, i) => String(i)),
    ),
    {
      proof: "Up to 10 claims.",
    },
  );
});

test("a row saved on the page and the same change on Ask's card store one section", () => {
  const cases = [
    ["offer", "  Evening cleaning ", { op: "set_offer", offer: "  Evening cleaning " }],
    ["offer", " ", { op: "set_offer", offer: " " }],
    ["who_for", "Vet clinics", { op: "set_who_for", who_for: "Vet clinics" }],
    ["fixes", "", { op: "set_fixes", fixes: "" }],
    ["sound", " Plain ", { op: "set_cold_tone", tone: " Plain " }],
    [
      "ending",
      { ...STORED.reach_out, signed_by: "Sam", phone: STORED.reach_out.phone },
      { op: "set_signed_by", name: "Sam" },
    ],
    ["ending", { ...STORED.reach_out, signature: "Sam\nOwner" }, { op: "set_signature", signature: "Sam\nOwner" }],
    ["reply_offer", "answer", { op: "set_reply_offer", offer: "answer" }],
    ["reply_offer", "booking_link", { op: "set_reply_offer", offer: "booking_link" }],
  ];
  for (const [fold, draft, change] of cases) {
    assert.deepEqual(
      S.saveFold(fold, stored(), draft).reach_out,
      applySettingsChange(stored(), change).reach_out,
      fold,
    );
  }
  const bare = { brain: STORED.brain, reach_out: { offer: "A" } };
  assert.equal(
    "reach_out" in applySettingsChange(bare, { op: "set_offer", offer: "" }),
    false,
    "gone, as a fold leaves it",
  );
});

test("every address written before the rows merged opens the sheet that holds them now", () => {
  for (const [row, now] of [
    ["signed_by", "ending"],
    ["signature", "ending"],
    ["sign_phone", "ending"],
    ["cold_tone", "sound"],
  ]) {
    assert.equal(paneOfRow(row), "outreach", row);
    assert.equal(settingsRowRoute(row), `admin/outreach/${now}`, row);
    assert.equal(settingsRowOf(`outreach/${row}`), now, row);
  }
  assert.equal(settingsRowOf("outreach/offer"), "offer", "a row that stayed is itself");
  assert.equal(settingsRowOf("receptionist/tone"), "tone", "the receptionist's own tone is not the cold one");
});
