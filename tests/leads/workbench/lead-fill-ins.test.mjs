/**
 * A fill-in on the lead's card (decision 0126): a filled blank is a piece of its own that names its blank, the step's
 * words can be read with every blank named, each fill-in says what it is and where it came from, and the receptionist's
 * mark says what will happen to the email. Pure: contracts alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  LEAD_FILL_WORDS: F,
  LEAD_WORDS_BOX: B,
  PREVIEW_LINE_WORDS: P,
  fillInSaysOf,
  leadWordsBlanks,
  leadWordsPieces,
  previewChipOf,
} = await import("@chanlytics/contracts");

const LEAD = { business_name: "Luxe Lane", city: "Austin" };
const WORKSPACE = { businessName: "Harbor Moving Co", yourName: "Sam", bookingLink: null };

test("a filled blank is a piece of its own, naming its blank; the words between stay words", () => {
  const pieces = leadWordsPieces({
    body: "Hi {{business}} in {{city}}.\n\n{{your name}}",
    lead: LEAD,
    workspace: WORKSPACE,
    opening: null,
  });
  assert.deepEqual(pieces, [
    { at: 0, kind: "words", text: "Hi " },
    { at: 3, kind: "value", text: "Luxe Lane", slot: "business" },
    { at: 12, kind: "words", text: " in " },
    { at: 16, kind: "value", text: "Austin", slot: "city" },
    { at: 22, kind: "words", text: ".\n\n" },
    { at: 25, kind: "value", text: "Sam", slot: "your name" },
  ]);
});

test("the line written for them stays the line, and a blank with nothing to fill it stays a mark", () => {
  const pieces = leadWordsPieces({
    body: "{{opening}} See {{booking link}}",
    lead: LEAD,
    workspace: WORKSPACE,
    opening: "Nice chairs.",
  });
  assert.deepEqual(
    pieces.map((p) => [p.kind, p.slot ?? null]),
    [
      ["line", null],
      ["words", null],
      ["mark", "booking link"],
    ],
  );
});

test("the blanks: the step's own words with every blank named, the line among them", () => {
  assert.deepEqual(leadWordsBlanks("{{opening}}\n\nHi {{business}}: {{their preview}}"), [
    { at: 0, kind: "blank", text: B.lineBlank, slot: "opening" },
    { at: 11, kind: "words", text: "\n\nHi " },
    { at: 16, kind: "blank", text: "Their business", slot: "business" },
    { at: 28, kind: "words", text: ": " },
    { at: 30, kind: "blank", text: "Their receptionist", slot: "their preview" },
  ]);
  assert.deepEqual(leadWordsBlanks("No blanks here."), [{ at: 0, kind: "words", text: "No blanks here." }]);
});
