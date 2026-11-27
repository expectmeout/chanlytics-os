/**
 * What the business offers: the plan's five, the card at rest, what it calls a booking, the sheet, and one editor at
 * a time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  businessGap,
  roleGate,
  APPOINTMENT_WORDS,
  appointmentWordSaved,
  appointmentWordVM,
} from "@chanlytics/contracts";
import { bookingRulesWords } from "../../../../apps/dashboard/src/surfaces/settings/business/model/booking-rules-words.ts";
import { unmount, settle, all, find, byTestId, textOf, classes, press, escapeSheet } from "../../../_stub-react.mjs";
import {
  BUSINESS_TAB,
  cancelFoldOf,
  drawTab,
  escape,
  labelled,
  marisa,
  openFold,
  openFolds,
  openRows,
  ownWords,
  redrawTab,
  saveFoldOf,
  saving,
  settingsHeld,
  typeAt,
  W,
  without,
} from "../../../_business-tab-harness.mjs";
import {
  LIMIT,
  consultHint,
  courier,
  drawnOf,
  full,
  many,
  markFor,
  nameOf,
  namesOf,
  openSheet,
  pickWord,
  problemOf,
  rowsOf,
  said,
  saveSheet,
  searchFor,
  sheetOf,
  shownOf,
  told,
  typeHeard,
  undoFor,
} from "./_offer.mjs";
import { bridgeHolds, holdRoles, provided } from "../../../shell/_bridge-holds.mjs";

/* ------------------------------------ the plan's five ------------------------------------ */

/** The word for a booking the row says: its value, which the row's act opens the five of (settings/choice-act.tsx). */
const wordShown = (tree) =>
  textOf(find(byTestId(tree, "rec-row-appointment_word"), (n) => n.props?.className === "rec-row-value")).trim();
test("the services row counts them and names the first three, and says nothing of how they are priced", () => {
  const row = byTestId(drawTab({ profile: many }), "rec-row-services");
  assert.equal(textOf(find(row, (n) => classes(n).includes("rec-row-value"))), "33", "the count alone");
  assert.equal(all(row, (n) => classes(n).includes("rec-chip")).length, 4, "three services and a +30");
  // "None names a price." stood under the names of nearly every record (24 Sep): a price is the sheet's to write.
  assert.equal(byTestId(row, "rec-services-priced"), null);
  assert.doesNotMatch(textOf(row), /names a price|quoted at consult|on record/i);
  assert.deepEqual(all(row, (n) => classes(n).includes("rec-chip")).map(textOf), [
    "Service 130 min",
    "Service 231 min",
    "Service 332 min",
    "+30",
  ]);
});

test("the sheet holds every service, and the search narrows them", () => {
  const tree = drawTab({ profile: many });
  press(byTestId(tree, "rec-row-act-services"));
  const open = () => redrawTab();
  assert.equal(rowsOf(open()).length, 33);
  const search = find(sheetOf(open()), (n) => classes(n).includes("rec-input"));
  assert.equal(search.props["aria-label"], "Search services", "the first box in the sheet is its search");
  search.props.onChange({ target: { value: "Service 1" } });
  const shown = shownOf(open());
  assert.ok(shown.length < 33 && shown.length > 0, "the search narrows without emptying");
  assert.equal(rowsOf(open()).length, 33, "and every row stays on the page, hidden, not taken off it");
});

test("removing a service offers it back at its own index", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const tree = drawTab({ profile: many, flash });
  press(byTestId(tree, "rec-row-act-services"));
  press(byTestId(redrawTab(flash), "rec-service-remove-2"));

  const toast = flashes.at(-1);
  assert.equal(typeof toast.undo, "function");
  assert.equal(said(toast), "Removed Service 3");
  assert.equal(rowsOf(redrawTab(flash)).length, 32);
  toast.undo();
  const rows = rowsOf(redrawTab(flash));
  assert.equal(rows.length, 33);
  assert.equal(nameOf(rows[2]), "Service 3", "and it comes back where it was, not at the end");
});

test("the booking-rules fold shows what the composer will write", () => {
  let tree = drawTab({ profile: marisa });
  openFold(tree, "booking_rules");
  tree = redrawTab();
  const S = W.__businessTabSave;
  const base = S.saver.base();
  const block = BUSINESS_TAB.consequenceOf(
    "booking_rules",
    S.saveFold("booking_rules", base, S.draftOf("booking_rules", base)).brain,
    "whatsapp",
  );
  assert.equal(
    textOf(byTestId(tree, "rec-fold-says-booking_rules")).includes(block.text),
    true,
    "the composer's own block, whole",
  );
  assert.match(block.text, /At least 2 hours' notice/);
  assert.match(textOf(byTestId(tree, "rec-fold-says-booking_rules")), /Preview what it's told/);
});

test("consult-first is its own row with its own name", () => {
  const row = byTestId(drawTab({ profile: marisa }), "rec-row-consult_first");
  assert.match(textOf(row), /Needs a consult first/i);
  assert.match(textOf(row), /Color correction, Extensions/);
  const empty = byTestId(
    drawTab({ profile: { ...marisa, booking_rules: without(marisa.booking_rules, "consult_first") } }),
    "rec-row-consult_first",
  );
  assert.match(textOf(empty), /None/);
  assert.equal(textOf(byTestId(empty, "rec-row-act-consult_first")).trim(), "Add one");
});

/* ------------------------------------ the card at rest ------------------------------------ */

test("What you offer draws two rows under its title, and Booking the rules, in one sentence contracts wrote", () => {
  const tree = drawTab();
  const card = byTestId(tree, "rec-card-offer");
  assert.equal(textOf(find(card, (n) => classes(n).includes("rec-card-title"))), "What you offer");
  assert.equal(textOf(find(card, (n) => classes(n).includes("rec-card-sub"))), "And what you call a booking");
  // What it calls a booking first (0041 J4): the word every page says of one. How customers buy is asked no more (0008,
  // amended 18 Oct 2026: every workspace has deals).
  assert.deepEqual(all(card, (n) => classes(n).includes("rec-row-key")).map(textOf), [
    "What you call a booking",
    "Services",
  ]);
  // The rules for booking are Hours & booking's (17 Oct 2026), with what the business books with, its link, and what
  // happens when someone wants to book (18 Oct 2026: one question where a switch and a matrix row stood).
  const booking = byTestId(tree, "rec-card-booking");
  assert.equal(textOf(find(booking, (n) => classes(n).includes("rec-card-title"))), "Booking");
  assert.deepEqual(all(booking, (n) => classes(n).includes("rec-row-key")).map(textOf), [
    "Booking tool",
    "Booking link",
    "When someone wants to book",
    // Decision 0073: one of the two things only the owner knows, asked at the first run's Your receptionist too.
    "Walk-ins",
    "Booking rules",
    "Needs a consult first",
  ]);
  const rules = byTestId(booking, "rec-row-booking_rules");
  assert.match(textOf(rules), new RegExp(escape(bookingRulesWords(marisa.booking_rules).line)));
  assert.equal(
    bookingRulesWords(marisa.booking_rules).line,
    "At least 2 hours' notice · 30-minute slots · up to 14 days ahead · up to 4 people",
    "the canvas's line",
  );
  // The notes under it, as sentences.
  const noted = drawTab({
    profile: {
      ...marisa,
      booking_rules: {
        ...marisa.booking_rules,
        notes: ["No chemical services after 4 PM", "Bridal parties are booked by phone"],
      },
    },
  });
  assert.equal(
    textOf(byTestId(noted, "rec-rules-notes")),
    "No chemical services after 4 PM. Bridal parties are booked by phone.",
  );
  // None of the five set: what the openings are worked out with, not "no rule".
  const bare = byTestId(
    drawTab({ profile: { ...marisa, booking_rules: { consult_first: ["Extensions"] } } }),
    "rec-row-booking_rules",
  );
  assert.match(textOf(bare), /The calendar's own · at least 2 hours' notice, up to 14 days ahead, in 30-minute slots/);
  assert.equal(textOf(byTestId(bare, "rec-row-act-booking_rules")).trim(), "Change");
});

test("a chip names a service alone where it has no duration", () => {
  const chips = all(
    byTestId(drawTab({ profile: { ...marisa, services: [{ name: "Cut" }] } }), "rec-row-services"),
    (n) => classes(n).includes("rec-chip"),
  );
  assert.deepEqual(chips.map(textOf), ["Cut"]);
});

test("with no services the row says none yet, and its act adds one", () => {
  const tree = drawTab({ profile: without(marisa, "services") });
  const row = byTestId(tree, "rec-row-services");
  assert.match(textOf(row), /None yet/);
  assert.equal(row.props["data-empty"], "true");
  assert.equal(textOf(byTestId(row, "rec-row-act-services")).trim(), "Add one");
  assert.equal(all(row, (n) => classes(n).includes("rec-chip")).length, 0);
  assert.equal(byTestId(row, "rec-services-priced"), null);
});

test("each act of What you offer is gated as a change to the settings, and named for what it acts on", () => {
  const asked = [];
  const was = provided("roles");
  // What each control asks the role store, and as what (frame/gate.ts): it may.
  holdRoles({
    can: (perm, doing) => {
      asked.push([perm, doing]);
      return true;
    },
  });
  // The word is offered only where there is a courier to save it through, as the zone is.
  bridgeHolds({ parts: { workspace: { patch: async () => ({ ok: true, workspace: {}, message: "" }) } } });
  try {
    const tree = drawTab();
    const mine = asked.filter(([, doing]) => /call a booking|services|booking rules|consult/.test(doing));
    assert.deepEqual(mine.slice(0, 4), [
      ["settings", "change what you call a booking"],
      ["settings", "change your services"],
      ["settings", "change the booking rules"],
      ["settings", "change what needs a consult first"],
    ]);
    const heard = (row) => byTestId(tree, `rec-row-act-${row}`).props["aria-label"];
    assert.deepEqual(["services", "booking_rules", "consult_first"].map(heard), [
      "Open the list of services",
      "Change the booking rules",
      "Change what needs a consult first",
    ]);
    // The word's act is its menu, named by the question and the word it says now.
    assert.equal(byTestId(tree, "appointment_word-menu").props["data-tip"], "What you call a booking: Appointment");
    assert.equal(textOf(byTestId(tree, "rec-row-act-services")).trim(), "Open the list", "the canvas's act");
  } finally {
    bridgeHolds({ parts: { roles: was } });
    bridgeHolds({ parts: { workspace: undefined } });
  }
});

test("a viewer reads what is offered and is offered no act on any of it, and nothing opens the sheet", () => {
  bridgeHolds({ parts: { roles: { can: (perm) => perm !== "settings", myRole: () => "viewer" } } });
  // A courier to save the answer through, so that only the role stops it.
  const patched = [];
  bridgeHolds({
    parts: {
      workspace: { patch: async (fields) => (patched.push(fields), { ok: true, workspace: fields, message: "" }) },
    },
  });
  try {
    const sent = saving();
    const tree = drawTab({ profile: many, word: "meeting" });
    const card = byTestId(tree, "rec-card-offer");
    assert.deepEqual(
      all(card, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || "")),
      [],
      "no row offers a change",
    );
    assert.equal(textOf(find(byTestId(card, "rec-row-services"), (n) => classes(n).includes("rec-row-value"))), "33");
    assert.match(
      textOf(byTestId(tree, "rec-card-booking")),
      /Color correction, Extensions/,
      "and everything is there to read",
    );
    assert.match(textOf(byTestId(card, "rec-row-appointment_word")), /Meeting/, "the word too, with no menu to open");
    assert.equal(byTestId(card, "appointment_word-menu"), null);
    // The page says why once, and this card does not say it again.
    const why = roleGate("viewer", "settings", "change the business").reason;
    assert.equal(all(tree, (n) => ownWords(n).includes(why)).length, 1);
    for (const id of ["services", "booking_rules", "consult_first"]) {
      W.__recordFolds.request(id);
      const again = redrawTab();
      assert.deepEqual([openFolds(again), sheetOf(again)], [[], null], id);
      W.__recordFolds.reset();
    }
    assert.equal(sent.length, 0);
    assert.deepEqual(patched, [], "and nothing goes to the workspace's courier");
  } finally {
    bridgeHolds({ parts: { roles: undefined } });
    bridgeHolds({ parts: { workspace: undefined } });
  }
});

test("What you call a booking states the workspace's word, and its menu offers the five, each with two of the phrases it makes: every word contracts'", () => {
  const c = courier();
  try {
    const tree = drawTab();
    const row = byTestId(tree, "rec-row-appointment_word");
    assert.equal(textOf(find(row, (n) => classes(n).includes("rec-row-key"))), "What you call a booking");
    // Never picked: an appointment, as everywhere a workspace has said nothing.
    assert.equal(wordShown(tree), "Appointment");
    press(byTestId(redrawTab(), "appointment_word-menu"));
    const items = all(redrawTab(), (n) => n.props?.role === "menuitemradio");
    const vm = appointmentWordVM("appointment");
    assert.deepEqual(
      items.map(textOf),
      vm.choices.map((ch) => `${ch.label}${ch.hint}`),
      "the five, each saying two phrases it makes",
    );
    assert.equal(vm.choices.length, APPOINTMENT_WORDS.length);
    assert.equal(vm.choices[2].hint, "Next meeting · Meeting reminder");
    // A word stored is the row's answer.
    assert.equal(wordShown(drawTab({ word: "session" })), "Session");
    assert.deepEqual(c.sent, [], "reading sends nothing");
  } finally {
    bridgeHolds({ parts: { workspace: undefined } });
  }
});

test("a word picked goes through the workspace's courier as { appointment_word } alone, never the settings save, and says what it says now", async () => {
  const c = courier();
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  try {
    drawTab({ flash });
    await pickWord("Session", flash);
    assert.deepEqual(c.sent, [{ appointment_word: "session" }], "the word alone: the zone is not sent with it");
    assert.equal(sent.length, 0, "never the settings save");
    assert.deepEqual(told(flashes.at(-1)), ["ok", appointmentWordSaved("session")]);
    assert.equal(told(flashes.at(-1))[1], "Saved · it says “session” now.");
    assert.equal(wordShown(redrawTab(flash)), "Session", "and the page follows it");
  } finally {
    bridgeHolds({ parts: { workspace: undefined } });
  }
});

test("a word refused says the server's words, and the row keeps the word it had", async () => {
  const c = courier({ answer: { ok: false, workspace: {}, message: "That workspace's word could not be changed." } });
  const flashes = [];
  const flash = (f) => flashes.push(f);
  try {
    drawTab({ flash });
    await pickWord("Lesson", flash);
    assert.deepEqual(c.sent, [{ appointment_word: "lesson" }]);
    assert.deepEqual(told(flashes.at(-1)), ["danger", "That workspace's word could not be changed."]);
    assert.equal(wordShown(redrawTab(flash)), "Appointment");
  } finally {
    bridgeHolds({ parts: { workspace: undefined } });
  }
});

test("only a role that may change the business is offered the word's menu: an operator reads it", () => {
  bridgeHolds({ parts: { roles: { can: (perm) => perm !== "settings", myRole: () => "operator" } } });
  courier();
  try {
    const tree = drawTab({ word: "meeting" });
    assert.equal(byTestId(tree, "appointment_word-menu"), null, "no menu, as no row of the business offers one");
    assert.match(textOf(byTestId(tree, "rec-row-appointment_word")), /Meeting/);
  } finally {
    bridgeHolds({ parts: { roles: undefined } });
    bridgeHolds({ parts: { workspace: undefined } });
  }
});

test("Needs a consult first says nothing of a deal: what follows a consultation is the business's own", () => {
  assert.equal(consultHint(drawTab()), null, "filled: the list, and nothing under it");
  const none = drawTab({ profile: { ...marisa, booking_rules: { ...marisa.booking_rules, consult_first: [] } } });
  assert.match(textOf(byTestId(none, "rec-row-consult_first")), /None/);
  assert.equal(consultHint(none), null, "empty: nothing either");
});

/* ------------------------------------ the sheet ------------------------------------ */

test("the sheet is the canvas's: its head, a search and Add, its columns, a consult-first mark, and a foot that says what it will be told", () => {
  let tree = drawTab({
    profile: {
      ...many,
      services: [
        { name: "Color correction", duration_min: 180, price_note: "quoted at consult" },
        ...many.services.slice(1),
      ],
    },
  });
  tree = openSheet(tree);
  const sheet = sheetOf(tree);
  assert.ok(sheet, "the act opens the sheet");
  // Its title alone, the row's own name (Ruben, 10 Oct 2026: a line under every title said it again).
  assert.equal(textOf(find(sheet, (n) => classes(n).includes("rec-sheet-title"))), "Services");
  assert.equal(
    find(sheet, (n) => classes(n).includes("rec-sheet-sub")),
    null,
  );
  assert.equal(
    find(byTestId(tree, "rec-services-search"), (n) => n.type === "input").props.placeholder,
    "Search services",
  );
  assert.match(textOf(byTestId(tree, "rec-services-add")), /Add/);
  // Takes says its unit in its box ("min"), so its head is the word alone; each row is four boxes and a remove.
  assert.equal(textOf(find(sheet, (n) => classes(n).includes("bt-service-head"))), "ServiceTakesPriceAmount");
  const third = rowsOf(tree)[2];
  assert.deepEqual(
    all(third, (n) => n.type === "input").map((n) => [n.props.id, n.props["aria-label"]]),
    [
      ["svc-2-name", "Service 3 name"],
      ["svc-2-minutes", "Service 3 takes (min)"],
      ["svc-2-price", "Service 3 price"],
      ["svc-2-amount", "Service 3 amount"],
    ],
  );
  assert.equal(all(third, (n) => n.type === "input")[1].props.inputMode, "numeric");
  assert.equal(byTestId(third, "rec-service-remove-2").props["aria-label"], "Remove Service 3");
  // A service the consult-first list names carries a mark, to read: that list is its own fold's.
  assert.equal(textOf(byTestId(tree, "rec-service-consult-0")), "consult first");
  assert.equal(byTestId(tree, "rec-service-consult-1"), null);
  // The foot: Save says Save, as every sheet's does, and no line about the Undo a removal offers in place.
  assert.equal(textOf(byTestId(tree, "rec-sheet-save-services")), "Save");
  assert.doesNotMatch(textOf(find(sheet, (n) => classes(n).includes("rec-sheet-foot"))), /undo/i);
  // With services in it the foot counts nothing (23 Sep: the count and its share went; the Save says how many).
  assert.equal(byTestId(tree, "rec-sheet-services-told-words"), null);
});

test("on a phone a service is one line, its name and how long and its price, that opens onto its boxes when pressed", () => {
  // Ruben, 10 Oct 2026: each service took two lines of boxes on a phone. A row the sheet opened with is its line (a desk
  // draws its boxes and never the line: settings.css); pressed, it opens, and so is a row added or typed in.
  let tree = drawTab({
    profile: {
      ...many,
      services: [
        { name: "Balayage", duration_min: 180, price_note: "" },
        { name: "Color", duration_min: 90, price_note: "$85" },
      ],
    },
  });
  tree = openSheet(tree);
  const rows = () => rowsOf(tree);
  assert.deepEqual(
    rows().map((r) => r.props["data-open"]),
    ["false", "false"],
    "rows from the record are folded",
  );
  const line = (i) => byTestId(tree, `rec-service-line-${i}`);
  assert.equal(textOf(line(0)), "Balayage3 h · At consult");
  assert.equal(textOf(line(1)), "Color1 h 30 min · $85");
  assert.equal(line(0).props["aria-expanded"], false);
  assert.equal(line(0).props["aria-controls"], "svc-0-name");
  // A finger's press opens the row and leaves the keyboard down (no focus moves); the other stays folded.
  line(0).props.onClick({ detail: 1 });
  tree = redrawTab();
  assert.deepEqual(
    rows().map((r) => r.props["data-open"]),
    ["true", "false"],
  );
  // A row added is open, for its boxes to be typed in.
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab();
  assert.equal(rows()[2].props["data-open"], "true");
  assert.equal(textOf(line(2)), "New serviceAt consult");
  // A list this short has no search, and its Add says what it adds.
  assert.equal(byTestId(tree, "rec-services-search"), null);
  assert.equal(textOf(byTestId(tree, "rec-services-add")).trim(), "Add a service");
});

test("the foot says only what an owner must know: Save says Save, and nothing counts the characters", () => {
  // The count, the characters and the share of the prompt went from the foot on 23 Sep ("33 services, 1,085 characters
  // — about a fifth of everything it reads" under thirty-three rows was the clutter it counted), and the count in the
  // Save on 10 Oct (every sheet's Save says Save). What is left is the one sentence for a list with nothing in it.
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  const words = () => byTestId(tree, "rec-sheet-services-told-words");
  assert.equal(words(), null, "nothing is counted on the glass");
  assert.equal(textOf(byTestId(tree, "rec-sheet-save-services")), "Save");
  press(byTestId(tree, "rec-service-remove-0"));
  tree = redrawTab();
  assert.equal(words(), null);
  assert.equal(textOf(byTestId(tree, "rec-sheet-save-services")), "Save");
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab();
  assert.equal(words(), null, "a row with no name is not 'no services'");
});

test("the search reads names only, and never reorders: what it leaves out is hidden in place", () => {
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  searchFor(tree, "service 2");
  tree = redrawTab();
  // Service 2, and 20 to 29, in the stored order: the order the receptionist reads them in.
  assert.deepEqual(namesOf(shownOf(tree)), ["Service 2", ...Array.from({ length: 10 }, (_, i) => `Service ${20 + i}`)]);
  // Hidden in place, each at its own index: nothing is taken off the page or moved.
  assert.deepEqual(
    namesOf(rowsOf(tree)),
    many.services.map((s) => s.name),
  );
  assert.equal(rowsOf(tree)[0].props.hidden, true);
  // Names only: a price note or a duration is not searched.
  searchFor(tree, "consult");
  tree = redrawTab();
  assert.deepEqual(
    [shownOf(tree).length, !!byTestId(tree, "rec-services-none")],
    [0, true],
    "no service is called that",
  );
  searchFor(tree, "45");
  tree = redrawTab();
  assert.equal(shownOf(tree).length, 0, "Service 16 takes 45 minutes, and is not found by it");
  // A name typed over until it no longer matches keeps its row in sight: the box being typed in never vanishes.
  searchFor(tree, "Service 3");
  tree = redrawTab();
  typeAt(tree, "Service 3 name", "Balayage");
  tree = redrawTab();
  assert.ok(namesOf(shownOf(tree)).includes("Balayage"), "REGRESSION: the row being typed in was hidden by the search");
  // And a row just added shows whatever the search says.
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab();
  assert.equal(namesOf(shownOf(tree)).at(-1), "");
  // Emptied, every row shows, in the order they were.
  searchFor(tree, "");
  tree = redrawTab();
  assert.equal(shownOf(tree).length, 34);
  assert.deepEqual(namesOf(shownOf(tree)).slice(0, 4), ["Service 1", "Service 2", "Balayage", "Service 4"]);
});

test("a removed row leaves an Undo where it was, and that Undo and the toast's both put it back at its index, once", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: many, flash });
  tree = openSheet(tree, flash);
  press(byTestId(tree, "rec-service-remove-4"));
  tree = redrawTab(flash);
  const gone = markFor(tree, "Service 5");
  assert.match(textOf(gone), /Removed Service 5/, "where the row was, inside the sheet's Tab ring");
  // It sits in the row's place: before the row that moved up into its index.
  assert.deepEqual(drawnOf(tree).slice(3, 6), ["Service 4", "<Service 5>", "Service 6"]);
  assert.equal(nameOf(rowsOf(tree)[4]), "Service 6");
  // The inline Undo.
  press(undoFor(tree, "Service 5"));
  tree = redrawTab(flash);
  assert.equal(nameOf(rowsOf(tree)[4]), "Service 5", "back at its own index");
  assert.equal(markFor(tree, "Service 5"), null, "and its Undo goes with it");
  // The toast's Undo, pressed after, has nothing left to put back: the row is not put back twice.
  flashes.at(-1).undo();
  tree = redrawTab(flash);
  assert.equal(rowsOf(tree).length, 33, "REGRESSION: a second copy of the row");

  // The toast's Undo first: the row comes back where it was, and the Undo in its place goes.
  press(byTestId(tree, "rec-service-remove-0"));
  tree = redrawTab(flash);
  assert.ok(markFor(tree, "Service 1"));
  flashes.at(-1).undo();
  tree = redrawTab(flash);
  assert.deepEqual([nameOf(rowsOf(tree)[0]), markFor(tree, "Service 1")], ["Service 1", null]);
});

test("a toast's Undo pressed after the sheet has closed puts nothing back, and says so", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: many, flash });
  tree = openSheet(tree, flash);
  press(byTestId(tree, "rec-service-remove-2"));
  tree = redrawTab(flash);
  const undo = flashes.at(-1).undo;
  press(byTestId(tree, "rec-sheet-cancel-services"));
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-sheet-services-cancel-yes"));
  tree = redrawTab(flash);
  assert.equal(sheetOf(tree), null, "the sheet has closed, and its draft with it");
  undo();
  assert.deepEqual(
    [flashes.at(-1).tone, said(flashes.at(-1))],
    ["warn", "Not put back · the editor it was in has closed. Open it again to change it."],
  );
  tree = openSheet(tree, flash);
  assert.equal(rowsOf(tree).length, 33, "it opens on what is stored");
  assert.equal(
    all(sheetOf(tree), (n) => classes(n).includes("bt-service-gone")).length,
    0,
    "and no Undo from the last opening is left in it",
  );
  assert.equal(sent.length, 0);
});

test("the list keeps its cap of sixty through Add and through both Undos", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: full, flash });
  tree = openSheet(tree, flash);
  assert.equal(rowsOf(tree).length, LIMIT);
  assert.equal(byTestId(tree, "rec-services-add"), null, "no Add past the cap the save's schema keeps");
  assert.match(
    textOf(byTestId(tree, "rec-services-cap")),
    /That is the most services AI keeps \(60\)\. Remove one first\./,
  );
  press(byTestId(tree, "rec-service-remove-0"));
  tree = redrawTab(flash);
  const toast = flashes.at(-1).undo;
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab(flash);
  assert.equal(rowsOf(tree).length, LIMIT);
  assert.equal(byTestId(tree, "rec-services-add"), null);
  toast();
  tree = redrawTab(flash);
  assert.equal(rowsOf(tree).length, LIMIT, "REGRESSION: the toast's Undo put a sixty-first back");
  assert.deepEqual(
    [flashes.at(-1).tone, said(flashes.at(-1))],
    ["warn", "Not put back · That is the most services AI keeps (60). Remove one first."],
  );
  press(undoFor(tree, "Service 1"));
  tree = redrawTab(flash);
  assert.equal(rowsOf(tree).length, LIMIT, "nor the Undo left where it was");
  assert.ok(markFor(tree, "Service 1"), "which stays, to put it back once there is room");
  // With room again, it goes back where it was.
  press(byTestId(tree, "rec-service-remove-59"));
  tree = redrawTab(flash);
  press(undoFor(tree, "Service 1"));
  tree = redrawTab(flash);
  assert.deepEqual([rowsOf(tree).length, nameOf(rowsOf(tree)[0])], [LIMIT, "Service 1"]);
  // And Add itself keeps the cap, pressed twice in one breath with room for one.
  tree = drawTab({ profile: { ...full, services: full.services.slice(0, LIMIT - 1) }, flash });
  tree = openSheet(tree, flash);
  press(byTestId(tree, "rec-services-add"));
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab(flash);
  assert.equal(rowsOf(tree).length, LIMIT);
});

test("a save sends the stored config with the services changed, and nothing else", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: many, flash });
  const stored = structuredClone(settingsHeld().config);
  tree = openSheet(tree, flash);
  typeAt(tree, "Service 3 takes (min)", "75");
  tree = redrawTab(flash);
  typeAt(tree, "Service 3 price", "  from a consult  ");
  tree = redrawTab(flash);
  saveSheet(tree);
  tree = redrawTab(flash);
  assert.equal(sent.length, 1);
  const expected = structuredClone(stored);
  expected.brain.profile.services[2] = { name: "Service 3", duration_min: 75, price_note: "from a consult" };
  assert.deepEqual(
    sent[0].config,
    expected,
    "the whole config, with one service changed and every other key as it was",
  );
  assert.equal(sheetOf(tree), null, "taken, the sheet closes");
  assert.equal(said(flashes.at(-1)), "Saved · AI picks it up within a minute");
});

test("an unchanged Save sends nothing and closes, and so does one typed and typed back", () => {
  const sent = saving();
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  saveSheet(tree);
  tree = redrawTab();
  assert.deepEqual([sent.length, sheetOf(tree)], [0, null]);
  tree = openSheet(tree);
  typeAt(tree, "Service 3 takes (min)", "75");
  tree = redrawTab();
  typeAt(tree, "Service 3 takes (min)", "32");
  tree = redrawTab();
  saveSheet(tree);
  tree = redrawTab();
  assert.deepEqual([sent.length, sheetOf(tree)], [0, null]);
});

test("what stops a save is said under its box, and nothing is sent", () => {
  const sent = saving();
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  typeAt(tree, "Service 2 takes (min)", "1.5");
  tree = redrawTab();
  typeAt(tree, "Service 4 name", "x".repeat(81));
  tree = redrawTab();
  saveSheet(tree);
  tree = redrawTab();
  assert.equal(sent.length, 0);
  assert.ok(sheetOf(tree), "the sheet stays open with what was typed");
  assert.equal(problemOf(tree, "svc-1-minutes"), "Minutes are a whole number, like 45.");
  assert.equal(problemOf(tree, "svc-3-name"), "At most 80 characters · this is 81.");
  assert.equal(labelled(tree, "Service 2 takes (min)").props["aria-invalid"], true);
  // Put right, its sentence goes with the change, and the save goes.
  typeAt(tree, "Service 2 takes (min)", "15");
  tree = redrawTab();
  assert.equal(problemOf(tree, "svc-1-minutes"), null);
  typeAt(tree, "Service 4 name", "Service 4");
  tree = redrawTab();
  saveSheet(tree);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.brain.profile.services[1].duration_min, 15);
});

test("while the sheet saves its boxes take nothing, and a press that would add or remove refuses the way Save does", () => {
  const sent = [];
  bridgeHolds({
    parts: {
      saveSettings: (config, version, accepted) =>
        new Promise(() => {
          sent.push({
            config: structuredClone(config),
            accept: () => accepted({ config: structuredClone(config), version: version + 1 }),
          });
        }),
    },
  });
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: many, flash });
  tree = openSheet(tree, flash);
  typeAt(tree, "Service 1 takes (min)", "40");
  tree = redrawTab(flash);
  saveSheet(tree);
  tree = redrawTab(flash);
  assert.deepEqual(
    [sheetOf(tree).props["aria-busy"], textOf(byTestId(tree, "rec-sheet-save-services"))],
    [true, "Saving…"],
  );
  assert.deepEqual(
    all(sheetOf(tree), (n) => n.type === "input" && / (name|minutes|price)$/.test(n.props["aria-label"] || ""))
      .map((n) => n.props.readOnly)
      .filter((r) => r !== true),
    [],
    "every box is read-only",
  );
  const held = (node) => [node.props["aria-disabled"], node.props.disabled];
  assert.deepEqual(
    [
      held(byTestId(tree, "rec-service-remove-0")),
      held(byTestId(tree, "rec-services-add")),
      held(byTestId(tree, "rec-sheet-save-services")),
    ],
    [
      [true, undefined],
      [true, undefined],
      [true, undefined],
    ],
  );
  const before = flashes.length;
  typeAt(tree, "Service 1 takes (min)", "41");
  press(byTestId(tree, "rec-service-remove-0"));
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab(flash);
  assert.deepEqual(
    [labelled(tree, "Service 1 takes (min)").props.value, rowsOf(tree).length, flashes.slice(before)],
    ["40", 33, []],
    "nothing typed or pressed under Saving… is held, or said",
  );
  // Escape and Close are Cancel, and nothing cancels a save that is out.
  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab(flash);
  assert.ok(sheetOf(tree));
  sent[0].accept();
  tree = redrawTab(flash);
  assert.equal(sheetOf(tree), null, "the server took it, and the sheet closed");
  assert.equal(sent[0].config.brain.profile.services[0].duration_min, 40);
});

/* ------------------------------------ one editor at a time ------------------------------------ */

test("Escape and Close are the sheet's Cancel: with changes they ask first, and with none they close", () => {
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();
  assert.equal(sheetOf(tree), null, "nothing typed: it closes at once");
  tree = openSheet(tree);
  typeAt(tree, "Service 1 price", "varies");
  tree = redrawTab();
  // Escape, as Base UI hears it on the document and asks the kit's sheet.
  escapeSheet(tree);
  tree = redrawTab();
  assert.ok(sheetOf(tree), "typed in: it stays open");
  assert.match(
    textOf(byTestId(tree, "rec-sheet-services-cancel-confirm")),
    /Discard changes\?/,
    "and asks, above its Save",
  );
  press(byTestId(tree, "rec-sheet-services-cancel-no"));
  tree = redrawTab();
  assert.equal(labelled(tree, "Service 1 price").props.value, "varies", "Keep editing keeps what was typed");
  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();
  press(byTestId(tree, "rec-sheet-services-cancel-yes"));
  tree = redrawTab();
  assert.equal(sheetOf(tree), null);
  tree = openSheet(tree);
  assert.equal(labelled(tree, "Service 1 price").props.value, "quoted at consult", "what was thrown away is gone");
  // A service row with no name is asked about too, though the save would drop it.
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab();
  press(byTestId(tree, "rec-sheet-cancel-services"));
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-sheet-services-cancel-confirm"));
});

test("opening the sheet with a fold holding changes asks about the fold, and opening a fold with the sheet holding changes asks about the sheet", () => {
  let tree = drawTab({ profile: many });
  openFold(tree, "booking_rules");
  tree = redrawTab();
  typeHeard(tree, "Least notice hours", "5");
  tree = redrawTab();
  tree = openSheet(tree);
  assert.deepEqual(
    [openFolds(tree), sheetOf(tree)],
    [["booking_rules"], null],
    "the fold's changes are not thrown away",
  );
  assert.match(textOf(byTestId(tree, "rec-fold-booking_rules-ask-confirm")), /Discard changes\?/);
  press(byTestId(tree, "rec-fold-booking_rules-ask-yes"));
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), !!sheetOf(tree)], [[], true], "answered, the sheet opens");

  typeAt(tree, "Service 2 name", "Balayage");
  tree = redrawTab();
  assert.equal(W.__settingsUnsaved(), true, "the rail asks before the pane goes");
  openFold(tree, "consult_first");
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), !!sheetOf(tree)], [[], true], "the sheet's changes are not thrown away");
  assert.match(
    textOf(byTestId(tree, "rec-sheet-services-ask-confirm")),
    /Discard changes\?/,
    "and it asks, in the sheet, since Tab never leaves it",
  );
  press(byTestId(tree, "rec-sheet-services-ask-no"));
  tree = redrawTab();
  assert.equal(labelled(tree, "Service 2 name").props.value, "Balayage");
  openFold(tree, "consult_first");
  tree = redrawTab();
  press(byTestId(tree, "rec-sheet-services-ask-yes"));
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), sheetOf(tree)], [["consult_first"], null]);
  // A clean sheet gives way at once.
  cancelFoldOf(tree, "consult_first");
  tree = openSheet(redrawTab());
  openFold(tree, "booking_rules");
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), sheetOf(tree)], [["booking_rules"], null]);
});

test("the gap line's services door opens the sheet, guarded like any row", () => {
  const bare = without(marisa, "services");
  let tree = drawTab({ profile: bare });
  assert.equal(businessGap(settingsHeld().config.brain, null).row, "services");
  press(byTestId(byTestId(tree, "rec-gap"), "rec-gap-door"));
  tree = redrawTab();
  assert.ok(sheetOf(tree), "the door opens the sheet, which no fold is");
  assert.deepEqual(
    [rowsOf(tree).length, textOf(byTestId(tree, "rec-sheet-services-told-words"))],
    [0, "No services, so it cannot say what you offer."],
  );
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab();
  typeAt(tree, "Service 1 name", "Balayage");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-sheet-services-told-words")), "", "one named: nothing to warn of");
  // With a fold holding changes, the door asks about them first.
  tree = drawTab({ profile: bare });
  openFold(tree, "consult_first");
  tree = redrawTab();
  typeHeard(tree, "Needs a consult first", "Keratin");
  tree = redrawTab();
  press(byTestId(byTestId(tree, "rec-gap"), "rec-gap-door"));
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), sheetOf(tree)], [["consult_first"], null]);
  assert.ok(byTestId(tree, "rec-fold-consult_first-ask-confirm"));
});

test("the sheet is the page's last hook-holding child: opened, drawn again and closed, every editor before it keeps its own", () => {
  // The kit's sheet holds hooks and is drawn only while it is open, and the stub keeps every hook on the page in one
  // order (_stub-react.mjs). Drawn before a card, it read that card's cells as its own the moment it opened.
  const sent = saving();
  let tree = drawTab({ profile: many });
  const at = (t) => [
    textOf(byTestId(t, "rec-row-hours")),
    textOf(byTestId(t, "rec-row-booking_rules")),
    textOf(byTestId(t, "rec-row-consult_first")),
  ];
  const rest = at(tree);
  tree = openSheet(tree);
  typeAt(tree, "Service 1 name", "Balayage");
  redrawTab();
  tree = redrawTab();
  assert.equal(labelled(tree, "Service 1 name").props.value, "Balayage", "the sheet keeps its draft over two draws");
  assert.deepEqual(at(tree), rest, "and every row before it says what it said");
  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();
  press(byTestId(tree, "rec-sheet-services-cancel-yes"));
  tree = redrawTab();
  assert.deepEqual(at(tree), rest);
  // Every editor before it opens, is typed in and asks as it did before the sheet ever opened.
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  assert.equal(labelled(tree, "Monday closes").props.value, "17:00");
  openFold(tree, "booking_rules");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["hours"]);
  press(byTestId(tree, "rec-fold-hours-ask-yes"));
  tree = redrawTab();
  typeHeard(tree, "Least notice hours", "6");
  tree = redrawTab();
  saveFoldOf(tree, "booking_rules");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.brain.profile.booking_rules.lead_hours, 6);
  // Opened again after all that, it opens on what is stored, and its rows read their own.
  tree = openSheet(redrawTab());
  assert.deepEqual(namesOf(rowsOf(tree)).slice(0, 2), ["Service 1", "Service 2"]);
  assert.deepEqual(openRows(tree), []);
});

test("an editor whose page goes away lets go of the sheet: back on the tab, it does not open by itself", async () => {
  let tree = drawTab({ profile: many });
  openSheet(tree);
  assert.equal(W.__recordFolds.open(), "services");
  unmount();
  await settle();
  assert.equal(
    W.__recordFolds.open(),
    null,
    "REGRESSION: the sheet was still the open one, and opened again with the tab",
  );
  tree = W.React.createElement(W.BusinessTab, { flash: () => {} });
  assert.equal(sheetOf(tree), null);
});
