/**
 * The Business tab's words (spec §10, with its amendments), EXECUTED: every phrase §10 retired is absent from what the
 * page draws, every phrase it kept is drawn where it belongs, and every label is sentence case, names the thing and
 * carries no colon and no instruction. settings-words.test.mjs holds Settings' and Setup's words on a stub of its own;
 * the page is drawn here, on the shared harness (_business-tab-harness.mjs), which a second stub in that file could
 * not share. The Calendar page's half of "Calendar it reads" is calendar-honest.test.mjs's, where that page is drawn.
 *
 * What is read is what the page draws: the tab at rest (every fold drawn closed and hidden, its head, hint and fields
 * with it), the two sheets open, a viewer's page, and a record with nothing in it. The composed prompt's own text is
 * not the page's words -- it is what the receptionist receives, word for word (Task 4.0's "Kept, on purpose") -- so
 * the prompt sheet's blocks are read for their heads and doors, never their text.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { unmount, all, find, byTestId, textOf, classes, press } from "./_legacy-react.mjs";
import { W, drawTab, redrawTab, melany } from "./_business-tab-harness.mjs";

after(() => unmount());

const { lastChangedFor } = await import("../../../apps/dashboard/src/legacy-bridge/inbox-verbs.ts");

/** The classes a label is drawn in: a card's title, a row's key, a fold's or an inline editor's, a field's, a rule's. */
const LABELS = [
  "rec-card-title",
  "rec-row-key",
  "rec-fold-label",
  "rec-inline-key",
  "rec-field-label",
  "bt-rule-label",
  "rec-sheet-title",
];
const labelsOf = (tree) =>
  all(tree, (n) => classes(n).some((c) => LABELS.includes(c)))
    .map((n) => textOf(n).trim())
    .filter(Boolean);

/** Who last changed the record, as the bridge says it (inbox-verbs.ts lastChangedFor), over the page's own read. */
const changedBy = (by, me, team = []) => {
  W.__SETTINGS.updatedAt = new Date(Date.now() - 7 * 60_000).toISOString();
  W.__SETTINGS.updatedBy = by;
  W.__ME = me;
  W.__TEAM = team;
  W.__lastChanged = () => lastChangedFor(W, Date.now());
};

/** The page at rest, both sheets open, and a viewer's page: everything the tab can draw on Melany's record. */
const everything = () => {
  const drawn = [];
  let tree = drawTab();
  changedBy("u-ruben", { id: "u-ruben", email: "ruben@rjcapital.example", role: "owner" });
  tree = redrawTab();
  drawn.push({ where: "the page at rest", tree });
  press(byTestId(tree, "rec-row-act-services"));
  tree = redrawTab();
  drawn.push({ where: "the services sheet", tree: byTestId(tree, "rec-sheet-services") });
  press(byTestId(tree, "rec-sheet-cancel-services"));
  tree = redrawTab();
  press(byTestId(tree, "rec-prompt-open"));
  tree = redrawTab();
  const sheet = byTestId(tree, "rec-sheet-prompt");
  // The blocks' text is the composed prompt, not the page's words; their heads and doors are the page's.
  const heads = all(sheet, (n) => classes(n).some((c) => c === "bt-prompt-block-head" || c === "rec-sheet-head"));
  drawn.push({ where: "the prompt sheet's heads", tree: heads });
  const was = W.canDo;
  W.canDo = () => false;
  try {
    drawn.push({ where: "a viewer's page", tree: drawTab() });
  } finally {
    W.canDo = was;
  }
  drawn.push({ where: "a record with nothing in it", tree: drawTab({ profile: {} }) });
  return drawn;
};

/* ------------------------------------ retired ------------------------------------ */

// §10's three tables, as the page must never say them again. Each is matched without regard to case: "your
// business" in the middle of a sentence is the same retired name.
const RETIRED = [
  "Anything else it should know",
  "Other things it should know",
  "Rules it always follows",
  "extra instructions",
  "Your business",
  "Business facts",
  "Hand over to a person when",
  "Transfers a caller to",
  "Calendar it may look at",
  "you set this",
  "differ from the default wording",
  "All times America/New_York",
  // Task 4.0: "3 messages sent in your name", said of the fallbacks wherever it stood.
  "sent in your name",
];

test("no phrase §10 retired is drawn anywhere on the Business tab", () => {
  for (const { where, tree } of everything()) {
    const text = textOf(tree);
    for (const phrase of RETIRED) {
      assert.ok(!text.toLowerCase().includes(phrase.toLowerCase()), `${where} says "${phrase}"`);
    }
  }
});

test("nobody's email is drawn, and no count sits on a row at rest", () => {
  const drawn = everything();
  for (const { where, tree } of drawn) {
    assert.doesNotMatch(textOf(tree), /[\w.+-]+@[\w-]+\.[\w.]+/, `${where} shows an email address`);
  }
  // A colleague with no name in the team is said by their address's local part, never the address.
  let tree = drawTab();
  changedBy("u-ana", { id: "u-ruben", email: "ruben@rjcapital.example" }, [
    { userId: "u-ana", email: "ana.lopez@salon.example", displayName: null },
  ]);
  tree = redrawTab();
  assert.match(textOf(byTestId(tree, "bt-head")), /ana\.lopez/);
  assert.doesNotMatch(textOf(byTestId(tree, "bt-head")), /@/);
  // "In your own words · 339 characters" and "3 messages sent in your name · 3 differ": a row states its fact.
  for (const row of all(tree, (n) => classes(n).includes("rec-row"))) {
    assert.doesNotMatch(textOf(row), /\d[\d,]*\s+characters?/, `${row.props["data-testid"]} carries a count`);
  }
});

test("the told section has no Show: its one door is Read it (Task 5.1)", () => {
  // "Show" opened the prompt inside the card; the told section's door opens the prompt sheet, and nothing on the page
  // is a Show any more.
  for (const { where, tree } of everything()) {
    const shows = all(tree, (n) => (n.type === "button" || n.type === "a") && /^show\b/i.test(textOf(n).trim()));
    assert.deepEqual(
      shows.map((n) => textOf(n).trim()),
      [],
      `${where} offers a Show`,
    );
  }
  const told = byTestId(drawTab(), "rec-card-told");
  assert.deepEqual(
    all(told, (n) => n.type === "button").map((n) => textOf(n).trim()),
    ["Read it"],
  );
});

/* ------------------------------------ kept ------------------------------------ */

test("every phrase §10 kept is drawn where it belongs", () => {
  let tree = drawTab();
  changedBy("u-ruben", { id: "u-ruben", email: "ruben@rjcapital.example", role: "owner" });
  tree = redrawTab();
  // Business: the page's own name, in its head.
  assert.equal(textOf(find(byTestId(tree, "bt-head"), (n) => classes(n).includes("bt-title"))), "Business");
  // Changed by you, 7m ago: never the address.
  assert.match(textOf(byTestId(tree, "bt-head")), /Changed by you, 7m ago/);
  // Hands you a customer: ONE row, both channels named in it.
  const hands = all(tree, (n) => classes(n).includes("rec-row-key") && textOf(n) === "Hands you a customer");
  assert.equal(hands.length, 1, "one row");
  const handoff = byTestId(tree, "rec-row-escalate_when");
  assert.match(textOf(handoff), /WhatsApp/);
  assert.match(textOf(handoff), /Phone/);
  // Calendar it reads: the row in When you're open.
  assert.equal(
    textOf(find(byTestId(tree, "rec-row-calendar"), (n) => classes(n).includes("rec-row-key"))),
    "Calendar it reads",
  );
  // What it's told: the told section, by its name, and its door, Read it.
  const told = byTestId(tree, "rec-card-told");
  assert.match(textOf(told), /What your receptionist is told/);
  assert.equal(textOf(byTestId(tree, "rec-prompt-open")).trim(), "Read it");
  // All times in New York time: the hours fold, in the name the card above uses.
  assert.match(textOf(byTestId(tree, "rec-fold-hours")), /All times in New York time/);
  // N messages, in your words.
  assert.match(
    textOf(byTestId(tree, "rec-row-fallbacks")),
    /^When it can't answer\d+ messages?, (in your words|the product's wording)/,
  );
});

/* ------------------------------------ how a label is written ------------------------------------ */

// A word inside a label that keeps its capital: a name, not a sentence's own word.
const NAMES = new Set([
  "WhatsApp",
  "Google",
  "Phone",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

test("every label is sentence case, names the thing, and carries no colon and no instruction", () => {
  for (const { where, tree } of everything()) {
    // A card's line under its title is a sentence too, and starts as one.
    for (const sub of all(tree, (n) => classes(n).some((c) => c === "rec-card-sub" || c === "rec-sheet-sub"))) {
      const words = textOf(sub).trim();
      if (words) assert.match(words, /^[A-Z0-9“"]/, `${where}: "${words}" does not start as a sentence does`);
    }
    for (const label of labelsOf(tree)) {
      assert.ok(!label.includes(":"), `${where}: "${label}" has a colon`);
      // How to fill it, after a comma, is a hint in the label's place ("Your reasons, one per line"): the label names
      // the thing, and the hint under the box says how to fill it. A list in a name ("Book, move or cancel") is a name.
      assert.doesNotMatch(
        label,
        /,\s*(one per|one each|separated|for example|e\.g\.|optional|if any)/i,
        `${where}: "${label}" says how to fill it as well as what it is`,
      );
      assert.match(label, /^[A-Z0-9]/, `${where}: "${label}" does not start as a sentence does`);
      const later = label
        .split(/\s+/)
        .slice(1)
        .filter((w) => /^[A-Z][a-z]/.test(w) && !NAMES.has(w.replace(/[^\w]/g, "")));
      assert.deepEqual(later, [], `${where}: "${label}" is title case`);
    }
  }
});

test("Who you are's transfer number is named as the thing it is, and Hands you a customer reads it", () => {
  // §10 retired "Transfers a caller to" as a row label, beside "Hand over to a person when", for ONE row naming both
  // channels (Hands you a customer). The number itself stays Who you are's to edit (Task 3.2's decision, spec §4.5's
  // amendment): one fact, one editor. Its row names the thing, the transfer number, and Hands you a customer says it,
  // with the door to that row.
  const tree = drawTab();
  const row = byTestId(tree, "rec-row-handoff_number");
  assert.equal(textOf(find(row, (n) => classes(n).includes("rec-row-key"))), "Transfer number");
  assert.equal(byTestId(tree, "rec-row-act-handoff_number").props["aria-label"], "Change the transfer number");
  assert.match(textOf(byTestId(tree, "rec-row-escalate_when")), /\+1 \(646\) 932-5775/);
  assert.equal(melany.handoff_number, "+16469325775");
});
