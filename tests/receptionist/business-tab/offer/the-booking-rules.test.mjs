/**
 * The booking rules, and a row put back between the same two rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { needsConsultation, foldName, serviceUndoName, servicesFoundWords } from "@chanlytics/contracts";
import {
  BOOKING_RULE_HINTS,
  bookingRuleRefusal,
} from "../../../../apps/dashboard/src/surfaces/settings/business/model/booking-rules-words.ts";
import { unmount, all, find, byTestId, textOf, classes, press, escapeSheet } from "../../../_stub-react.mjs";
import {
  cancelFoldOf,
  drawTab,
  foldOf,
  labelled,
  marisa,
  openFold,
  openFolds,
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
  TEN,
  drawnOf,
  full,
  heard,
  heardBox,
  many,
  namesOf,
  openSheet,
  problemOf,
  removeNamed,
  rowsOf,
  said,
  searchFor,
  sheetOf,
  shownOf,
  ten,
  typeHeard,
  undoFor,
} from "./_offer.mjs";

/* ------------------------------------ the booking rules ------------------------------------ */

test("the booking rules fold holds the five numbers as one list, each with its unit and its default as its placeholder, and the notes", () => {
  let tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  const fold = foldOf(tree, "booking_rules");
  const boxes = all(fold, (n) => n.type === "input");
  // Named by the words on screen and the unit beside them (WCAG 2.5.3, the quality review): "Offers times up to" was
  // once named "Days ahead", which a person using speech to press it could not say.
  assert.deepEqual(
    boxes.map((n) => heard(tree, n)),
    ["Least notice hours", "Slot length min", "Gap between min", "Offers times up to days", "Largest group people"],
  );
  // What an empty box is worked out with is its placeholder (Ruben, 10 Oct 2026: "Empty uses 2 hours." under each box
  // said it twice).
  assert.deepEqual(
    boxes.map((n) => n.props.placeholder),
    ["2", "30", "0", "14", "4"],
    "and its placeholders",
  );
  assert.deepEqual(
    boxes.map((n) => n.props.value),
    ["2", "30", "", "14", "4"],
    "each as its box holds it",
  );
  assert.ok(boxes.every((n) => n.props.inputMode === "numeric"));
  // Each a line of one list: its name on the left, its box and unit on the right; then the switch on a line of its own.
  assert.deepEqual(all(fold, (n) => classes(n).includes("bt-line-name")).map(textOf), [
    "Least notice",
    "Slot length",
    "Gap between",
    "Offers times up to",
    "Largest group",
    "Ask for their email",
  ]);
  assert.deepEqual(all(fold, (n) => classes(n).includes("rec-input-unit")).map(textOf), [
    "hours",
    "min",
    "min",
    "days",
    "people",
  ]);
  // No sentence under any box: the one fact a box needs beside it is the party size's, behind a tip, contracts'.
  assert.deepEqual(all(fold, (n) => classes(n).includes("rec-hint")).map(textOf), []);
  assert.deepEqual(
    all(fold, (n) => classes(n).includes("rec-tip")).map((n) => n.props["data-tip"]),
    [BOOKING_RULE_HINTS.party_max],
  );
  assert.equal(heardBox(tree, "Other rules").type, "textarea");
  assert.doesNotMatch(textOf(fold), /Saves these five rules/, "a Save writes what its sheet holds: no line says so");
  assert.doesNotMatch(textOf(fold), /It never books/, "the rules' own row says it (Never confirm a booking)");
});

test("the booking rules fold's switch asks for an email when the link goes out: off unless stored, and saved as true or as no key", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  let fold = foldOf(tree, "booking_rules");
  let sw = byTestId(fold, "rec-rule-ask-email");
  assert.equal(sw.props.role, "switch");
  assert.equal(sw.props["aria-checked"], false, "off by default: nothing stored is no");
  // Named by the words beside it, which a person using speech can say (as the guardrails' switches are).
  assert.equal(heard(tree, sw), "Ask for their email");
  assert.equal(
    textOf(find(tree, (n) => n.props?.id === sw.props["aria-describedby"])),
    "When it sends the booking link",
  );
  // Under the five numbers, above the notes.
  assert.deepEqual(
    all(fold, (n) => n === sw || n.type === "input" || n.type === "textarea").map((n) =>
      n === sw ? "switch" : n.type,
    ),
    ["input", "input", "input", "input", "input", "switch", "textarea"],
  );
  press(sw);
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-rule-ask-email").props["aria-checked"], true);
  // The block of what a save will say carries the ask at once: it is composed from the fold's own save.
  assert.match(textOf(byTestId(tree, "rec-fold-says-booking_rules")), /ask once for their best email address/);
  saveFoldOf(tree, "booking_rules");
  redrawTab();
  assert.deepEqual(
    sent[0].config.brain.profile.booking_rules,
    { ...marisa.booking_rules, ask_email: true },
    "on is stored as true, beside the rules as they were",
  );
  // Stored on, the switch is on; off again, the key goes rather than a false being written.
  tree = drawTab({ profile: { ...marisa, booking_rules: { ...marisa.booking_rules, ask_email: true } } });
  openFold(tree, "booking_rules");
  tree = redrawTab();
  fold = foldOf(tree, "booking_rules");
  sw = byTestId(fold, "rec-rule-ask-email");
  assert.equal(sw.props["aria-checked"], true, "as stored");
  press(sw);
  tree = redrawTab();
  saveFoldOf(tree, "booking_rules");
  redrawTab();
  assert.deepEqual(sent[1].config.brain.profile.booking_rules, marisa.booking_rules, "off is no key at all");
});

test("each booking rule saves within its range; outside it, or not a whole number, it is refused under its box with its sentence", () => {
  const sent = saving();
  const S = W.__businessTabSave;
  const labels = {
    lead_hours: "Least notice hours",
    slot_min: "Slot length min",
    buffer_min: "Gap between min",
    max_days_ahead: "Offers times up to days",
    party_max: "Largest group people",
  };
  for (const [key, lo, hi] of S.RULES) {
    const words = bookingRuleRefusal(key);
    for (const bad of [String(hi + 1), String(lo - 1), "2.5", "30min", "1e2"]) {
      if (bad === "-1" && lo === 0) continue;
      let tree = drawTab();
      openFold(tree, "booking_rules");
      tree = redrawTab();
      typeHeard(tree, labels[key], bad);
      tree = redrawTab();
      saveFoldOf(tree, "booking_rules");
      tree = redrawTab();
      assert.equal(sent.length, 0, `${key} ${bad}`);
      assert.equal(problemOf(tree, `bt-rule-${key}`), words, `${key} ${bad}: said under its own box`);
      assert.deepEqual(openFolds(tree), ["booking_rules"]);
    }
    for (const good of [lo, hi]) {
      let tree = drawTab({ profile: { ...marisa, booking_rules: { consult_first: ["Extensions"] } } });
      openFold(tree, "booking_rules");
      tree = redrawTab();
      typeHeard(tree, labels[key], String(good));
      tree = redrawTab();
      saveFoldOf(tree, "booking_rules");
      const last = sent.at(-1);
      assert.equal(last.config.brain.profile.booking_rules[key], good, `${key} ${good}`);
      assert.deepEqual(last.config.brain.profile.booking_rules.consult_first, ["Extensions"], "consult-first is kept");
      sent.length = 0;
    }
  }
});

test("the booking rules' save writes those rules and their notes, and nothing else on the page", () => {
  const sent = saving();
  // Consult-first is stored inside the booking rules and is not this fold's: it is the key the fold does not render.
  let tree = drawTab();
  const stored = structuredClone(settingsHeld().config);
  openFold(tree, "booking_rules");
  tree = redrawTab();
  typeHeard(tree, "Least notice hours", "");
  tree = redrawTab();
  typeHeard(tree, "Gap between min", "15");
  tree = redrawTab();
  typeHeard(tree, "Other rules", "No chemical services after 4 PM\n\nBridal parties are booked by phone  ");
  tree = redrawTab();
  // What it will be told, as the composer writes it for this draft.
  assert.match(
    textOf(byTestId(tree, "rec-fold-says-booking_rules")),
    /- No chemical services after 4 PM\n- Bridal parties are booked by phone/,
  );
  saveFoldOf(tree, "booking_rules");
  const expected = structuredClone(stored);
  const rules = expected.brain.profile.booking_rules;
  delete rules.lead_hours;
  rules.buffer_min = 15;
  rules.notes = ["No chemical services after 4 PM", "Bridal parties are booked by phone"];
  assert.deepEqual(
    sent[0].config,
    expected,
    "only the fold's own keys: an emptied box deletes its key, and consult-first is kept as it was",
  );
  assert.deepEqual(sent[0].config.brain.profile.booking_rules.consult_first, marisa.booking_rules.consult_first);
  assert.deepEqual(openFolds(redrawTab()), []);
});

test("consult-first saves one service to a line, under its own name, and says what it will be told in the booking rules' block", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "consult_first");
  tree = redrawTab();
  assert.equal(heardBox(tree, "Needs a consult first").props.value, "Color correction\nExtensions");
  assert.match(
    heardBox(tree, "Needs a consult first").props.placeholder,
    /^One service per line/,
    "one to a line, said in the box: its sheet has no sentence under its title",
  );
  typeHeard(tree, "Needs a consult first", "Color correction\nExtensions\n  Keratin  \n");
  tree = redrawTab();
  assert.match(
    textOf(byTestId(tree, "rec-fold-says-consult_first")),
    /These need a consultation before they can be booked: Color correction, Extensions, Keratin\./,
  );
  saveFoldOf(tree, "consult_first");
  assert.deepEqual(sent[0].config.brain.profile.booking_rules, {
    ...marisa.booking_rules,
    consult_first: ["Color correction", "Extensions", "Keratin"],
  });
  // Too many, or one too long, is said under the box, and nothing is sent.
  tree = drawTab();
  openFold(tree, "consult_first");
  tree = redrawTab();
  typeHeard(tree, "Needs a consult first", Array.from({ length: 21 }, (_, i) => `Service ${i}`).join("\n"));
  tree = redrawTab();
  saveFoldOf(tree, "consult_first");
  tree = redrawTab();
  assert.equal(sent.length, 1);
  assert.equal(problemOf(tree, "bt-consult-first"), "At most 20 services, one to a line · this is 21.");
});

test("consult-first and the booking rules share one stored object, and saved one after the other, both land", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "consult_first");
  tree = redrawTab();
  typeHeard(tree, "Needs a consult first", "Keratin");
  tree = redrawTab();
  saveFoldOf(tree, "consult_first");
  tree = redrawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  typeHeard(tree, "Least notice hours", "6");
  tree = redrawTab();
  saveFoldOf(tree, "booking_rules");
  assert.equal(sent.length, 2);
  assert.deepEqual(
    sent[1].config.brain.profile.booking_rules,
    { ...marisa.booking_rules, lead_hours: 6, consult_first: ["Keratin"] },
    "REGRESSION: one fold put the other's keys back as they were",
  );
  assert.equal(sent[1].version, 8, "the second on the first's answer");
  // The other way round.
  sent.length = 0;
  tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  typeHeard(tree, "Largest group people", "8");
  tree = redrawTab();
  saveFoldOf(tree, "booking_rules");
  tree = redrawTab();
  openFold(tree, "consult_first");
  tree = redrawTab();
  typeHeard(tree, "Needs a consult first", "");
  tree = redrawTab();
  saveFoldOf(tree, "consult_first");
  assert.deepEqual(sent[1].config.brain.profile.booking_rules, {
    ...without(marisa.booking_rules, "consult_first"),
    party_max: 8,
  });
});

test("the consult-first mark and the search's folding are contracts' own rules, the Calendar's and the phone tool's", () => {
  // The spec review's probe: the sheet folded names with a copy of contracts' foldName, and matched the consult-first list
  // with a copy of needsConsultation. A second implementation of a rule is a bug even when it agrees (root CLAUDE.md).
  // Eight, so the sheet has its search (it comes with a list long enough to search: services.tsx BTS_SEARCH_FROM).
  const services = [
    { name: "Colour Correction" },
    { name: "Uñas de gel" },
    { name: " Extensions" },
    { name: "Cut" },
    ...["Gloss", "Toner", "Trim", "Wash"].map((name) => ({ name })),
  ];
  const rules = { ...marisa.booking_rules, consult_first: ["colour correction ", "EXTENSIONS"] };
  let tree = drawTab({ profile: { ...marisa, services, booking_rules: rules } });
  tree = openSheet(tree);
  const marked = services.map((_, i) => !!byTestId(tree, `rec-service-consult-${i}`));
  assert.deepEqual(
    marked,
    services.map((s) => needsConsultation(s.name, rules)),
    "each row marked as contracts answers for it",
  );
  assert.deepEqual(marked, [true, false, true, false, false, false, false, false]);
  for (const words of ["unas", "UÑAS", " uñas "]) {
    searchFor(tree, words);
    tree = redrawTab();
    assert.deepEqual(
      namesOf(shownOf(tree)),
      ["Uñas de gel"],
      `${JSON.stringify(words)} finds the name as a caller's words find it`,
    );
    assert.ok(foldName("Uñas de gel").includes(foldName(words.trim())));
  }
});

test("a row taken out goes back between the same two rows, whatever was taken out after it: the review's repro", () => {
  // The spec review's probe. Service 6 out, then Service 3: Service 6's Undo was drawn between 7 and 8, and pressed it
  // gave 1, 2, 4, 5, 7, 6, 8. Each Undo kept the index its row had when it went, and put the row back there.
  let tree = openSheet(drawTab({ profile: ten }));
  removeNamed(tree, "Service 6");
  tree = redrawTab();
  removeNamed(tree, "Service 3");
  tree = redrawTab();
  assert.deepEqual(
    drawnOf(tree),
    [
      "Service 1",
      "Service 2",
      "<Service 3>",
      "Service 4",
      "Service 5",
      "<Service 6>",
      "Service 7",
      "Service 8",
      "Service 9",
      "Service 10",
    ],
    "each Undo where its row was",
  );
  press(undoFor(tree, "Service 6"));
  tree = redrawTab();
  assert.deepEqual(
    namesOf(rowsOf(tree)),
    [
      "Service 1",
      "Service 2",
      "Service 4",
      "Service 5",
      "Service 6",
      "Service 7",
      "Service 8",
      "Service 9",
      "Service 10",
    ],
    "REGRESSION: 1, 2, 4, 5, 7, 6, 8",
  );
  assert.deepEqual(
    drawnOf(tree).slice(0, 3),
    ["Service 1", "Service 2", "<Service 3>"],
    "the Undo still waiting stays in its row's place",
  );
  press(undoFor(tree, "Service 3"));
  tree = redrawTab();
  assert.deepEqual(namesOf(rowsOf(tree)), TEN);
  assert.equal(all(byTestId(tree, "rec-services-rows"), (n) => classes(n).includes("bt-service-gone")).length, 0);
});

test("two rows taken out go back in either order, apart or from the same gap, and the toast's Undo and the one in the row's place put a row back once", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  // Apart, the later removal put back first.
  let tree = openSheet(drawTab({ profile: ten, flash }), flash);
  removeNamed(tree, "Service 6");
  tree = redrawTab(flash);
  const six = flashes.at(-1).undo;
  removeNamed(tree, "Service 3");
  tree = redrawTab(flash);
  press(undoFor(tree, "Service 3"));
  tree = redrawTab(flash);
  assert.deepEqual(drawnOf(tree), [
    "Service 1",
    "Service 2",
    "Service 3",
    "Service 4",
    "Service 5",
    "<Service 6>",
    "Service 7",
    "Service 8",
    "Service 9",
    "Service 10",
  ]);
  // The toast's Undo for Service 6, then the one in its place, pressed in the same breath before the page draws again: once.
  const inPlace = undoFor(tree, "Service 6");
  six();
  press(inPlace);
  tree = redrawTab(flash);
  assert.deepEqual(namesOf(rowsOf(tree)), TEN, "REGRESSION: a second Service 6");
  assert.equal(undoFor(tree, "Service 6"), null, "and its Undo in the row's place goes with it");

  // From the same gap: Service 3, then Service 4, which had moved up into its place.
  for (const first of ["Service 3", "Service 4"]) {
    tree = openSheet(drawTab({ profile: ten, flash }), flash);
    removeNamed(tree, "Service 3");
    tree = redrawTab(flash);
    const three = flashes.at(-1).undo;
    removeNamed(tree, "Service 4");
    tree = redrawTab(flash);
    assert.deepEqual(
      drawnOf(tree).slice(0, 5),
      ["Service 1", "Service 2", "<Service 3>", "<Service 4>", "Service 5"],
      "two Undos in one gap, in their rows' order",
    );
    press(undoFor(tree, first));
    tree = redrawTab(flash);
    press(undoFor(tree, first === "Service 3" ? "Service 4" : "Service 3"));
    tree = redrawTab(flash);
    assert.deepEqual(namesOf(rowsOf(tree)), TEN, `${first} put back first`);
    // The toast's Undo for Service 3, pressed after the one in its place put it back, puts nothing back again.
    three();
    assert.deepEqual(namesOf(rowsOf(redrawTab(flash))), TEN);
  }

  // A row put back before a waiting one moves it down with the rows around it; one taken out after it leaves it be.
  tree = openSheet(drawTab({ profile: ten, flash }), flash);
  removeNamed(tree, "Service 2");
  tree = redrawTab(flash);
  removeNamed(tree, "Service 9");
  tree = redrawTab(flash);
  removeNamed(tree, "Service 5");
  tree = redrawTab(flash);
  press(undoFor(tree, "Service 2"));
  tree = redrawTab(flash);
  removeNamed(tree, "Service 10");
  tree = redrawTab(flash);
  for (const name of ["Service 9", "Service 10", "Service 5"]) {
    press(undoFor(tree, name));
    tree = redrawTab(flash);
  }
  assert.deepEqual(namesOf(rowsOf(tree)), TEN);
});

test("while the sheet could not open, the services row offers no act, as a fold offers none; and nothing is taken down", () => {
  // The spec review's probe: a stored list whose draft cannot be worked out (here a hand-edited record whose services
  // are not a list). BtFold hides its act then; the services row offered one that opened nothing.
  const errors = [];
  const was = console.error;
  console.error = (...args) => errors.push(args);
  try {
    let tree = drawTab({ profile: { ...marisa, services: { Balayage: 180 } } });
    const row = byTestId(tree, "rec-row-services");
    assert.equal(byTestId(row, "rec-row-act-services"), null, "REGRESSION: an act that opened nothing");
    assert.match(textOf(row), /None yet/, "and the row still says what it says");
    W.__recordFolds.request("services");
    tree = redrawTab();
    assert.equal(sheetOf(tree), null);
    assert.ok(byTestId(tree, "rec-card-offer"), "the page is still there");
  } finally {
    console.error = was;
  }
  // With a list, the act is there.
  assert.ok(byTestId(drawTab({ profile: many }), "rec-row-act-services"));
});

test("an Undo from an earlier opening says the editor it was in has closed, even on a list that is full now", () => {
  // The quality review's P2: the sheet closed and opened again on sixty services, and the old toast's Undo said the
  // list was full, as if the row could go back once one was taken out. It cannot: its editor went.
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = openSheet(drawTab({ profile: full, flash }), flash);
  press(byTestId(tree, "rec-service-remove-0"));
  tree = redrawTab(flash);
  const old = flashes.at(-1).undo;
  press(byTestId(tree, "rec-sheet-cancel-services"));
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-sheet-services-cancel-yes"));
  tree = openSheet(redrawTab(flash), flash);
  assert.equal(rowsOf(tree).length, LIMIT);
  old();
  assert.deepEqual(
    [flashes.at(-1).tone, said(flashes.at(-1))],
    ["warn", "Not put back · the editor it was in has closed. Open it again to change it."],
    "REGRESSION: it said the list was full",
  );
  assert.equal(rowsOf(redrawTab(flash)).length, LIMIT);
});

test("a row put back while the search says something else comes back in sight, pinned to that search and no later one", () => {
  // The quality review's P6: a row taken out while searching "Service 5" and put back while searching "Service 7" came
  // back hidden, so its Undo put it somewhere nobody could see, and focus went to a hidden box. A row changed since the
  // sheet opened stays in sight under the search in force when it changed; it was pinned against every later search too.
  let tree = openSheet(drawTab({ profile: ten }));
  searchFor(tree, "Service 5");
  tree = redrawTab();
  removeNamed(tree, "Service 5");
  tree = redrawTab();
  searchFor(tree, "Service 7");
  tree = redrawTab();
  press(undoFor(tree, "Service 5"));
  tree = redrawTab();
  assert.deepEqual(namesOf(shownOf(tree)), ["Service 5", "Service 7"], "REGRESSION: it came back hidden");
  // Pinned to the search it came back under, not to every one after it.
  searchFor(tree, "Service 9");
  tree = redrawTab();
  assert.deepEqual(namesOf(shownOf(tree)), ["Service 9"]);
  // And a name typed over under one search stays in sight under that search, and is searched as any other after it.
  searchFor(tree, "Service 3");
  tree = redrawTab();
  typeAt(tree, "Service 3 name", "Balayage");
  tree = redrawTab();
  assert.deepEqual(namesOf(shownOf(tree)), ["Balayage"]);
  searchFor(tree, "Service 8");
  tree = redrawTab();
  assert.deepEqual(
    namesOf(shownOf(tree)),
    ["Service 8"],
    "REGRESSION: a row changed once was shown under every search after",
  );
  searchFor(tree, "bala");
  tree = redrawTab();
  assert.deepEqual(namesOf(shownOf(tree)), ["Balayage"], "found by its new name like any other");
});

test("every box of What you offer is named by the words on screen beside it, so a person who says them reaches it", () => {
  // WCAG 2.5.3, label in name (the quality review): "Offers times up to" was named "Days ahead", and "Anything else
  // about booking, one per line" was named "Booking notes".
  let tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  const fold = foldOf(tree, "booking_rules");
  for (const box of all(fold, (n) => n.type === "input" || n.type === "textarea")) {
    const holder = find(fold, (n) => n.type === "label" && !!find(n, (m) => m === box));
    const visible = textOf(find(holder, (n) => classes(n).includes("rec-field-label")));
    assert.ok(heard(tree, box).startsWith(visible), `${heard(tree, box)} starts with ${visible}`);
  }
  cancelFoldOf(tree, "booking_rules");
  openFold(redrawTab(), "consult_first");
  tree = redrawTab();
  const consult = find(foldOf(tree, "consult_first"), (n) => n.type === "textarea");
  assert.equal(
    heard(tree, consult),
    "Needs a consult first",
    "the fold's own label, which is the words on screen above it",
  );
  // The sheet's boxes: each is named for its row and the column it is in, whose head is the words on screen.
  cancelFoldOf(tree, "consult_first");
  tree = openSheet(redrawTab());
  const head = all(
    find(sheetOf(tree), (n) => classes(n).includes("bt-service-head")),
    (n) => n.type === "span",
  )
    .map(textOf)
    .filter(Boolean);
  assert.deepEqual(head, ["Service", "Takes", "Price", "Amount"]);
  const boxes = all(rowsOf(tree)[1], (n) => n.type === "input");
  boxes.forEach((box, i) =>
    assert.match(
      heard(tree, box),
      new RegExp(head[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `${heard(tree, box)} holds ${head[i]}`,
    ),
  );
  assert.match(heard(tree, boxes[1]), /min/, "and the minutes box its unit, min, as it is on screen");
});

test("Ctrl or Cmd with Enter saves the sheet, as it saves a fold", () => {
  const sent = saving();
  let tree = openSheet(drawTab({ profile: many }));
  typeAt(tree, "Service 3 takes (min)", "75");
  tree = redrawTab();
  const box = labelled(tree, "Service 3 takes (min)");
  sheetOf(tree).props.onKeyDown({
    key: "Enter",
    ctrlKey: true,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    currentTarget: { contains: () => true },
    target: box,
  });
  assert.equal(sent.length, 1, "REGRESSION: the sheet had no key to save it");
  assert.equal(sent[0].config.brain.profile.services[2].duration_min, 75);
  assert.equal(sheetOf(redrawTab()), null, "taken, and closed");
});

test("the services sheet is drawn by the page's last child, its one sheet slot, with the sheet closed and open", () => {
  // The rule the page's comment stated and nothing held: the kit's sheet holds hooks and is drawn only while open, so
  // a card drawn after it reads shifted hook cells whenever it opens (surfaces/settings/business/gestures/ BtSheet). A card
  // composed below the sheet's line is the first thing this catches, before any of its rows misbehave. Since Phase 5
  // the last child is the slot both sheets go through (surfaces/settings/business/tab.tsx BtSheetSlot; the prompt sheet's half of this is
  // business-tab-prompt.test.mjs).
  const drawnIn = (node) => [].concat(node.rendered.props.children).filter((c) => c != null && c !== false);
  let tree = drawTab({ profile: many, part: "workspace" });
  assert.equal(drawnIn(tree).at(-1).type, W.BtSheetSlot, "closed");
  assert.deepEqual(
    drawnIn(drawnIn(tree).at(-1)).map((c) => c.type),
    [W.BtServicesSheet],
    "the services sheet in it",
  );
  tree = openSheet(tree);
  assert.ok(sheetOf(tree));
  const slot = drawnIn(tree).at(-1);
  assert.equal(slot.type, W.BtSheetSlot, "and open");
  // And the kit's sheet is the last thing the slot draws, so the last hook-holding thing on the page.
  const sheet = drawnIn(slot).at(-1);
  assert.deepEqual(
    [sheet.type, sheet.rendered.type, sheet.rendered.rendered.type],
    [W.BtServicesSheet, W.BtSheet, W.RecordSheet],
  );
});

test("each Undo left in a row's place has its own name and id, from what it puts back, two in one gap included", () => {
  // The quality review: two Undos waiting in one gap shared one test id (it was their place), and each was named only
  // "Undo", so a screen reader could not tell which row it put back.
  let tree = openSheet(drawTab({ profile: ten }));
  removeNamed(tree, "Service 3");
  tree = redrawTab();
  removeNamed(tree, "Service 4");
  tree = redrawTab();
  const marks = all(byTestId(tree, "rec-services-rows"), (n) => classes(n).includes("bt-service-gone"));
  const ids = marks.map((n) => n.props["data-testid"]);
  assert.equal(new Set(ids).size, 2, "REGRESSION: one id for two Undos");
  const undos = marks.map((n) => find(n, (m) => m.type === "button"));
  assert.deepEqual(
    undos.map((b) => b.props["aria-label"]),
    [serviceUndoName("Service 3"), serviceUndoName("Service 4")],
  );
  assert.equal(serviceUndoName("Service 3"), "Undo removing Service 3");
  assert.equal(serviceUndoName(""), "Undo removing a service");
  assert.ok(
    undos.every((b) => b.props["aria-label"].startsWith(textOf(b))),
    "and each name holds the word on it (WCAG 2.5.3)",
  );
  // Each by its own id: the one for Service 4 puts Service 4 back.
  press(byTestId(tree, ids[1].replace("gone", "undo")));
  tree = redrawTab();
  assert.deepEqual(drawnOf(tree).slice(0, 5), ["Service 1", "Service 2", "<Service 3>", "Service 4", "Service 5"]);
});

test("a hand-edited record whose consult-first list or rule notes are not lists draws its rows, and the sheet opens", () => {
  // The quality review's probe: each threw as the card drew, and the whole of Settings went with it.
  const errors = [];
  const was = console.error;
  console.error = (...args) => errors.push(args);
  try {
    // The preview is composed from a sane record (the server's composer parses what it composes); the stored config the
    // page reads is then hand-edited, as the probe did, and the page drawn again over it.
    drawTab({ profile: many });
    // Replaced, never changed in place: the stored profile is the harness's fixture object, which every later test reads.
    const brain = settingsHeld().config.brain;
    brain.profile = {
      ...brain.profile,
      booking_rules: { ...brain.profile.booking_rules, consult_first: "Extensions", notes: "Cash only" },
    };
    W.__businessTabSave.saver.reset();
    // A page drawn afresh over it, as it is drawn when the tab opens on such a record.
    unmount();
    let tree = W.React.createElement(W.BusinessTab, { flash: () => {}, part: ["workspace", "hours"] });
    assert.match(textOf(byTestId(tree, "rec-row-consult_first")), /None/, "a list that is not one is none");
    assert.doesNotMatch(textOf(byTestId(tree, "rec-row-booking_rules")), /Cash only/);
    tree = openSheet(tree);
    assert.ok(sheetOf(tree), "and the sheet opens over it");
    assert.equal(all(sheetOf(tree), (n) => classes(n).includes("bt-service-consult")).length, 0);
  } finally {
    console.error = was;
  }
});

test("Escape in a search with words in it clears the search first, and the next Escape is the sheet's", () => {
  // The quality review: Escape in the search closed the sheet (or asked), where a search box's Escape clears it.
  let tree = openSheet(drawTab({ profile: ten }));
  searchFor(tree, "Service 3");
  tree = redrawTab();
  const box = () => find(byTestId(tree, "rec-services-search"), (n) => n.type === "input");
  const esc = () => ({
    key: "Escape",
    defaultPrevented: false,
    stopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  });
  const first = esc();
  box().props.onKeyDown(first);
  assert.deepEqual(
    [first.stopped, first.defaultPrevented],
    [true, false],
    "the sheet never hears it, and the box's own clear is not stopped",
  );
  tree = redrawTab();
  assert.deepEqual(
    [box().props.value, shownOf(tree).length, !!sheetOf(tree)],
    ["", 10, true],
    "cleared, every row back, the sheet open",
  );
  // Empty, the search leaves Escape to the sheet: it goes on to close it.
  const second = esc();
  box().props.onKeyDown(second);
  assert.equal(second.stopped, false);
  escapeSheet(tree, { taken: second.defaultPrevented });
  assert.equal(sheetOf(redrawTab()), null, "nothing typed: it closes");
});

test("the search says politely how many rows it found, in contracts' words", () => {
  // The quality review: nothing told a screen reader what the search had done to the list.
  let tree = openSheet(drawTab({ profile: many }));
  const status = () => byTestId(tree, "rec-services-found");
  assert.deepEqual(
    [status().props.role, status().props["aria-live"], textOf(status())],
    ["status", "polite", ""],
    "nothing to say with no search",
  );
  searchFor(tree, "Service 2");
  tree = redrawTab();
  assert.equal(textOf(status()), servicesFoundWords(shownOf(tree).length, 33));
  assert.equal(textOf(status()), "11 of 33 services");
  searchFor(tree, "zzz");
  tree = redrawTab();
  assert.equal(textOf(status()), "No service is called that.");
  // A cleared search says nothing again: every row is back, which the list itself shows.
  searchFor(tree, "");
  tree = redrawTab();
  assert.equal(textOf(status()), "");
  // The one region, drawn from the sheet's first draw, so what it says is heard as it changes.
  assert.equal(all(sheetOf(tree), (n) => n.props?.role === "status").length, 1);
});

test("a consult-first mark describes its row's name box, so it is heard with the box", () => {
  // The quality review: the mark beside a name was a word nobody heard with the box it stood beside.
  const tree = openSheet(
    drawTab({ profile: { ...many, booking_rules: { ...marisa.booking_rules, consult_first: ["Service 2"] } } }),
  );
  const mark = byTestId(tree, "rec-service-consult-1");
  const nameBox = labelled(tree, "Service 2 name");
  assert.ok(mark.props.id, "the mark has an id");
  const by = String(nameBox.props["aria-describedby"] || "").split(" ");
  assert.ok(by.includes(mark.props.id), "and the name box is described by it");
  assert.equal(
    textOf(find(tree, (n) => n.props?.id === mark.props.id)),
    "consult first",
    "which says what the mark says",
  );
  // Only one row's box: an id is the page's once, and a row it does not mark is described by nothing of it.
  assert.equal(all(tree, (n) => n.props?.id === mark.props.id).length, 1);
  assert.ok(
    !String(labelled(tree, "Service 3 name").props["aria-describedby"] || "").includes("consult"),
    "a row it does not mark",
  );
});
