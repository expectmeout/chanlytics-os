/**
 * A step's words, written where they are read (the canvas's step editor): Ask's two changes, Warmer and Shorter, are held
 * to one rule before their words reach the box (contracts keepsValues): every value the words held, a numbered slot or a
 * reach-out's named one, the subject's with the body's, kept one for one. And a step's preview read as someone of its
 * batch (contracts exampleParamsFor): their own first name by the wire's rule, the example's words for the rest, and who
 * gets which said.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SEQUENCE_EDIT_WORDS as E, exampleParams, exampleParamsFor, keepsValues } from "@chanlytics/contracts";

const EMAIL = { subject: "A note for {{1}}", body: "Hi {{1}}, see you {{2}}. Book at {{3}}." };

test("words written again keep every value one for one, the subject's counted with the body's", () => {
  assert.equal(keepsValues(EMAIL, { subject: "So glad you're coming, {{1}}", body: "Hi {{1}}! {{2}} — {{3}}." }), true);
  assert.equal(
    keepsValues(EMAIL, { subject: "A note", body: "Hi {{1}}, {{1}}, {{2}}: {{3}}." }),
    true,
    "moved, not lost",
  );
  assert.equal(
    keepsValues({ subject: null, body: "{{opening}} Worth a call?" }, { subject: null, body: "{{opening}} A call?" }),
    true,
    "a reach-out's named slot is kept as a numbered one is",
  );
  assert.equal(
    keepsValues(EMAIL, { subject: "A note for {{1}}", body: "Hi {{1}}, soon. Book at {{3}}." }),
    false,
    "{{2}} dropped",
  );
  assert.equal(
    keepsValues(EMAIL, { subject: "A note for {{1}}", body: "Hi {{1}} {{2}} {{3}} {{4}}" }),
    false,
    "{{4}} added",
  );
  assert.equal(keepsValues(EMAIL, { subject: "A note", body: "Hi {{1}}, see you {{2}}. Book at {{3}}." }), false);
});

test("a step read as someone of its batch: their first name, or 'there' as the wire says it, the example's words for the rest", () => {
  const specs = [
    { kind: "first_name" },
    { kind: "visit_when" },
    { kind: "business_name" },
    { kind: "text", value: "10% off" },
  ];
  assert.deepEqual(exampleParamsFor(specs, "Harbor Studio", "Ana"), [
    "Ana",
    "tomorrow at 2:00 PM",
    "Harbor Studio",
    "10% off",
  ]);
  assert.deepEqual(exampleParamsFor(specs, "Harbor Studio", null).slice(0, 1), ["there"]);
  assert.deepEqual(exampleParams(specs, "Harbor Studio").slice(0, 1), ["Dani"], "the example is still Dani");
  assert.equal(E.getsIt("Ana Morales", "On WhatsApp"), "Ana Morales gets it on WhatsApp.");
  assert.equal(E.getsIt("Marcus Bell", "By email"), "Marcus Bell gets it by email.");
});
