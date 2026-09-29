/**
 * The re-key script's own judgements (tooling/scripts/ops/erasure-rekey.mjs): what is still legacy, which replies keep
 * a legacy hash for their undo, and what a sample shows of a digest -- never the whole of one, which is as good as the
 * number it hides. The re-key itself is the database's (erasure-digest.db.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cut, legacy, planHoldsLegacy } from "../../../ops/erasure-rekey.mjs";

test("a digest is legacy when it is set and not keyed", () => {
  assert.equal(legacy("ab".repeat(32)), true);
  assert.equal(legacy(`h1:${"cd".repeat(32)}`), false);
  for (const nothing of [null, undefined, ""]) assert.equal(legacy(nothing), false);
});

test("a reply is re-keyed when either list its undo reads keeps a legacy hash, and never for anything else in its plan", () => {
  assert.equal(planHoldsLegacy({ changed: { holds: [{ kind: "email", hash: "ab12" }] } }), true);
  assert.equal(planHoldsLegacy({ changed: { suppressions: [{ kind: "domain", hash: "ab12" }] } }), true);
  assert.equal(planHoldsLegacy({ changed: { holds: [{ kind: "email", hash: "h1:ab12" }], suppressions: [] } }), false);
  assert.equal(
    planHoldsLegacy({ changed: { leads: [{ id: "l1", hash: "ab12" }] } }),
    false,
    "not a list the undo reads",
  );
  for (const plan of [null, {}, { changed: null }, { changed: { holds: "ab12" } }])
    assert.equal(planHoldsLegacy(plan), false, JSON.stringify(plan));
});

test("a sample shows eight characters of a digest and never the whole", () => {
  const whole = "ab".repeat(32);
  assert.equal(cut(whole), "abababab…");
  assert.ok(!cut(whole).includes(whole));
  assert.equal(cut(null), null);
});
