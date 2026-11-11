/**
 * A fill-in on the lead's card (decision 0127): a filled blank is a piece of its own that names its blank (contracts), a
 * step's words can be read with every blank named, each fill-in says what it is and where it came from, and the
 * receptionist's mark says what will happen to the email (the sheet's own model). Pure: no page is drawn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { leadWordsPieces } = await import("@chanlytics/contracts");
const {
  LEAD_FILL_WORDS: F,
  emailBlanksOf,
  fillInSaysOf,
  previewMarkOf,
} = await import("../../../apps/dashboard/src/surfaces/leads/sheet/model/fill-ins.ts");

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
    pieces.map((piece) => [piece.kind, piece.slot ?? null]),
    [
      ["line", null],
      ["words", null],
      ["mark", "booking link"],
    ],
  );
});

test("the blanks: a step's own words with every blank named, the line among them; none where it names none", () => {
  assert.deepEqual(
    emailBlanksOf({ subject: "For {{business}}", body: "{{opening}}\n\nHi {{business}}: {{their preview}}" }),
    {
      subject: [
        { at: 0, kind: "words", text: "For " },
        { at: 4, kind: "blank", text: "Their business", slot: "business" },
      ],
      body: [
        { at: 0, kind: "blank", text: F.lineBlank, slot: "opening" },
        { at: 11, kind: "words", text: "\n\nHi " },
        { at: 16, kind: "blank", text: "Their business", slot: "business" },
        { at: 28, kind: "words", text: ": " },
        { at: 30, kind: "blank", text: "Their receptionist", slot: "their preview" },
      ],
    },
  );
  // A later step has no subject; words that name no blank have no blanks to show.
  assert.equal(emailBlanksOf({ subject: null, body: "Try it: {{their preview}}" }).subject, null);
  assert.equal(emailBlanksOf({ subject: null, body: "No blanks here." }), null);
});

test("what a fill-in says: what it is, where it came from, and whether it changes", () => {
  assert.deepEqual(fillInSaysOf("business", LEAD), { title: F.business, from: F.fromMaps, varies: F.each });
  assert.equal(fillInSaysOf("city", { ...LEAD, source: "people_at_companies" }).from, F.fromDirectory);
  assert.equal(fillInSaysOf("business", { ...LEAD, source: "file" }).from, F.fromList);
  // The card's lead says no source: a company is the people card's, a place the Maps card's.
  assert.equal(fillInSaysOf("company", { ...LEAD, kind: "company" }).from, F.fromDirectory);
  assert.equal(fillInSaysOf("first name", LEAD).from, F.nobody);
  assert.deepEqual(fillInSaysOf("your name", LEAD), { title: F.yourName, from: F.signs, varies: F.same });
  assert.equal(fillInSaysOf("booking link", LEAD).varies, F.same);
  // The line has its own tint and its own press, and the receptionist its own mark: neither is a bubble.
  assert.equal(fillInSaysOf("opening", LEAD), null);
  assert.equal(fillInSaysOf("their preview", LEAD), null);
});

const NOW = new Date("2026-11-11T12:00:00Z");
const row = (over = {}) => ({
  state: "ready",
  token: "t",
  failed_why: null,
  ends_at: "2026-12-01T00:00:00Z",
  first_sent_at: null,
  opened_count: 0,
  asked_count: 0,
  call_count: 0,
  call_seconds: 0,
  tried_at: null,
  claimed_at: null,
  not_right: [],
  ...over,
});

test("the receptionist's mark says what will happen to the email, as the send would do it", () => {
  const words = F.mark;
  assert.equal(previewMarkOf(null, NOW), null, "not read yet: it says its name alone");
  assert.deepEqual(previewMarkOf({ preview: null, makes: true }, NOW), { say: words.none, tone: "quiet" });
  assert.deepEqual(previewMarkOf({ preview: null, makes: false }, NOW), { say: words.notOurs, tone: "warn" });
  assert.deepEqual(previewMarkOf({ preview: row({ state: "building" }), makes: true }, NOW), {
    say: words.building,
    tone: "busy",
  });
  assert.deepEqual(previewMarkOf({ preview: row(), makes: true }, NOW), { say: words.ready, tone: "go" });
  assert.deepEqual(previewMarkOf({ preview: row({ state: "failed", failed_why: "no_name" }), makes: true }, NOW), {
    say: words.failed,
    tone: "warn",
  });
  assert.deepEqual(previewMarkOf({ preview: row({ ends_at: "2026-11-01T00:00:00Z" }), makes: true }, NOW), {
    say: words.ended,
    tone: "warn",
  });
  assert.deepEqual(previewMarkOf({ preview: row({ state: "claimed" }), makes: true }, NOW), {
    say: words.claimed,
    tone: "done",
  });
});
