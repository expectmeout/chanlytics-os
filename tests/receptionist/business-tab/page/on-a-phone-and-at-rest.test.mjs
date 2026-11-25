/**
 * The Business tab on a phone, its motion as the stub can see it, and what is on screen at rest.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, find, byTestId, textOf, classes, press, atWidth } from "../../../_stub-react.mjs";
import {
  cancelFoldOf,
  cancelRow,
  drawTab,
  foldOf,
  labelled,
  openFold,
  openFolds,
  redrawTab,
  saveFoldOf,
  saveRow,
  saving,
  settingsHeld,
  typeAt,
  typeInto,
  W,
} from "../../../_business-tab-harness.mjs";
import { drawnAtRest, lastDrawn, ruleBox, saysLines, voiceBox } from "./_page.mjs";

test("on a phone a row opens as a sheet from the bottom, asks there, and its save sends only that fold's keys", () => {
  const width = atWidth(true);
  try {
    const sent = saving();
    let tree = drawTab();
    const stored = structuredClone(settingsHeld().config);
    openFold(tree, "tone");
    tree = redrawTab();
    const sheet = foldOf(tree, "tone");
    assert.deepEqual(
      [sheet.props.role, sheet.props["aria-modal"], sheet.props["aria-labelledby"]],
      ["dialog", true, "rec-fold-tone-label"],
      "a modal dialog, named by the row's label",
    );
    assert.equal(voiceBox(tree).props["aria-labelledby"], "rec-fold-tone-label", "and the box is named by it too");
    assert.deepEqual(openFolds(tree), ["tone"]);
    voiceBox(tree).props.onChange({ target: { value: "Calm and kind." } });
    tree = redrawTab();

    // Another row asked for: the one holding changes asks, in its sheet, above its Save.
    openFold(tree, "booking_rules");
    tree = redrawTab();
    assert.deepEqual(openFolds(tree), ["tone"], "one editor open, as at any width");
    const foot = find(foldOf(tree, "tone"), (n) => classes(n).includes("rec-sheet-foot"));
    assert.match(textOf(byTestId(foot, "rec-fold-tone-ask-confirm")), /Discard changes\?/, "in the sheet's foot");
    press(byTestId(tree, "rec-fold-tone-ask-no"));
    tree = redrawTab();
    assert.equal(byTestId(tree, "rec-fold-tone-ask-confirm"), null);
    assert.equal(voiceBox(tree).props.value, "Calm and kind.", "Keep editing keeps what was typed");

    saveFoldOf(tree, "tone");
    tree = redrawTab();
    const expected = structuredClone(stored);
    expected.brain.profile.tone = "Calm and kind.";
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].config, expected, "the stored config with the voice written, and nothing else");
    assert.deepEqual(openFolds(tree), [], "taken, the sheet goes");
    assert.equal(
      find(tree, (n) => n.props?.role === "dialog"),
      null,
    );
  } finally {
    width.put();
  }
});

test("a window that crosses a phone's width while a row is open keeps it open, and keeps what was typed", () => {
  // Decided in Task 6.2b: the frame is the kit's and the draft is the page's, so a width crossed while a fold is open
  // draws the same fold in the other frame, and nothing is asked. A phone turned on its side, or a window dragged
  // narrower, is not a person leaving what they typed.
  const width = atWidth(true);
  try {
    let tree = drawTab();
    openFold(tree, "tone");
    tree = redrawTab();
    voiceBox(tree).props.onChange({ target: { value: "Calm and kind." } });
    tree = redrawTab();
    width.resize(false);
    tree = redrawTab();
    const fold = foldOf(tree, "tone");
    // The Business tab's folds are sheets at every width (RecordFold frame="sheet"), so the frame is the same one.
    assert.deepEqual([fold.props.role, fold.props.hidden], ["dialog", undefined], "a desktop's sheet, still open");
    assert.equal(voiceBox(tree).props.value, "Calm and kind.", "with what was typed");
    assert.equal(W.__settingsUnsaved(), true, "and still asked about before it is thrown away");
    width.resize(true);
    tree = redrawTab();
    assert.equal(foldOf(tree, "tone").props.role, "dialog", "and a sheet again");
    assert.equal(voiceBox(tree).props.value, "Calm and kind.");
  } finally {
    width.put();
  }
});

test("on a phone the sheet slot is still the page's last child: a row's sheet is drawn where its fold is, and every row keeps its own", () => {
  // A row's sheet is not the slot's. The slot is for what is drawn only while open (the kit's RecordSheet, which holds
  // hooks then and none while closed); a fold holds the same hooks drawn open or closed, as a sheet or under its row,
  // so it is drawn where the row is and moves no cell after it. The registry keeps one editor open at a time, so a
  // row's sheet and the slot's never stand on the page together.
  const width = atWidth(true);
  try {
    const at = (t) =>
      ["rec-row-tone", "rec-row-services", "rec-row-booking_rules"].map((id) => textOf(byTestId(t, id)));
    // The three pages as one, so the slot is the page's own last child (the record whole adds Autonomy's rows after it).
    let tree = drawTab({ part: ["workspace", "hours", "receptionist"] });
    const rest = at(tree);
    openFold(tree, "hours");
    tree = redrawTab();
    assert.equal(lastDrawn(tree).type, W.BtSheetSlot, "the slot is still last");
    assert.equal(
      find(lastDrawn(tree), (n) => n.props?.role === "dialog"),
      null,
      "and draws no sheet of the row's",
    );
    assert.equal(
      find(byTestId(tree, "rec-card-open"), (n) => n.props?.role === "dialog")?.props["data-testid"],
      "rec-fold-hours",
      "the row's sheet is drawn by its own card",
    );
    assert.deepEqual(at(tree), rest, "every row after it says what it said");
    typeAt(tree, "Monday closes", "17:00");
    tree = redrawTab();
    assert.equal(labelled(tree, "Monday closes").props.value, "17:00");
    press(byTestId(tree, "rec-fold-cancel-hours"));
    tree = redrawTab();
    press(byTestId(tree, "rec-fold-hours-cancel-yes"));
    tree = redrawTab();
    assert.deepEqual(at(tree), rest);
    // The slot's own sheet opens after it, as it always did.
    press(byTestId(tree, "rec-row-act-services"));
    tree = redrawTab();
    assert.deepEqual(
      all(tree, (n) => n.props?.role === "dialog").map((n) => n.props["data-testid"]),
      ["rec-sheet-services"],
    );
    assert.equal(lastDrawn(tree).type, W.BtSheetSlot);
  } finally {
    width.put();
  }
});

test("as the draft changes, only the line of what it will be told that changed is marked, and only until the next change", () => {
  let tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  const opened = saysLines(tree, "booking_rules");
  assert.ok(opened.length > 1, "the whole block is drawn as the fold opens");
  assert.deepEqual(
    opened.filter(([, on]) => on),
    [],
    "nothing has changed yet: the block the fold opens with is not a change",
  );

  ruleBox(tree, "lead_hours").props.onChange({ target: { value: "3" } });
  tree = redrawTab();
  const once = saysLines(tree, "booking_rules");
  const was = opened.map(([l]) => l);
  // The lines the draft changed, worked out from the block before and after, as the page must.
  const fresh = once.filter(([l]) => l.trim() !== "" && !was.includes(l)).map(([l]) => l);
  assert.equal(fresh.length, 1, `one line of the block says the notice: ${JSON.stringify(fresh)}`);
  assert.match(fresh[0], /3 hours/);
  assert.deepEqual(
    once.filter(([, on]) => on).map(([l]) => l),
    fresh,
    "that line is marked, and no other",
  );

  // Drawn again with nothing changed, the mark stays where it is: it is the same line, and does not wash twice.
  tree = redrawTab();
  assert.deepEqual(saysLines(tree, "booking_rules"), once);

  // The next change marks its own line, and the last one's mark goes.
  ruleBox(tree, "party_max").props.onChange({ target: { value: "6" } });
  tree = redrawTab();
  const twice = saysLines(tree, "booking_rules");
  const marked = twice.filter(([, on]) => on).map(([l]) => l);
  assert.equal(marked.length, 1, JSON.stringify(marked));
  assert.match(marked[0], /6 people/);
  assert.ok(!/3 hours/.test(marked[0]), "the notice's line, changed a keystroke ago, washes no more");

  // Closed and opened again, the block is new to the person, and nothing in it is a change.
  press(byTestId(tree, "rec-fold-cancel-booking_rules"));
  tree = redrawTab();
  press(byTestId(tree, "rec-fold-booking_rules-cancel-yes"));
  tree = redrawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  assert.deepEqual(
    saysLines(tree, "booking_rules").filter(([, on]) => on),
    [],
  );
});

test("a row's own line of what it will say is marked as it changes, not as it first appears", () => {
  let tree = drawTab();
  press(byTestId(tree, "rec-row-act-website"));
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  const lines = () =>
    all(byTestId(tree, "rec-inline-says-website"), (n) => classes(n).includes("rec-says-line")).map((l) => [
      textOf(l),
      l.props["data-changed"] === "true",
    ]);
  const first = lines().filter(([l]) => l.includes("marisas.example"));
  assert.equal(first.length, 1, "it says the new address");
  assert.equal(first[0][1], false, "what arrives with the block is not a change of it");
  typeInto(tree, "website", "https://marisas.example/book");
  tree = redrawTab();
  const marked = lines().filter(([, on]) => on);
  assert.deepEqual(marked.length, 1);
  assert.match(marked[0][0], /marisas\.example\/book/, "the line the keystroke changed");
});

test("a row drawn again as its editor's save closes it says so, for its value to arrive; opened and cancelled, it does not", () => {
  // Spec §9, item 4, the save settle: the fold closes, and the row's value arrives on the house's rise-in. The row is
  // what says it arrived with a save (data-settled, the kit's RecordRow), for record.css to play rise-in on it once.
  const settled = (tree, id) => byTestId(tree, `rec-row-${id}`).props["data-settled"];
  saving();
  let tree = drawTab();
  assert.equal(settled(tree, "tone"), undefined, "drawn with the page, a row is simply there");
  assert.equal(settled(tree, "website"), undefined);

  // A fold, saved.
  openFold(tree, "tone");
  tree = redrawTab();
  find(foldOf(tree, "tone"), (n) => n.type === "textarea").props.onChange({ target: { value: "Calm and kind." } });
  tree = redrawTab();
  saveFoldOf(tree, "tone");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), []);
  assert.equal(settled(tree, "tone"), "true", "the fold's row, drawn again by its save");
  assert.equal(settled(tree, "website"), undefined, "and no other");

  // A row edited in place, saved.
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "https://marisas.example");
  tree = redrawTab();
  saveRow(tree, "website");
  tree = redrawTab();
  assert.equal(settled(tree, "website"), "true", "the row, drawn again by its save");

  // Opened and cancelled: nothing was saved, so nothing arrives.
  tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  cancelFoldOf(tree, "booking_rules");
  tree = redrawTab();
  assert.equal(settled(tree, "booking_rules"), undefined, "a fold cancelled");
  openFold(tree, "website");
  tree = redrawTab();
  cancelRow(tree, "website");
  tree = redrawTab();
  assert.equal(settled(tree, "website"), undefined, "a row cancelled");
});

test("on a phone a row open as a sheet is still drawn in its card behind it, so nothing under the wash moves", () => {
  // Task 6.2b's note 8: the card under a row's sheet was one row shorter, and grew back as the sheet went, which the
  // sheet's leaving (spec §9, item 1) would have put on show. The fold draws the row behind its sheet (RecordFold's
  // `behind`); the page still draws it itself only while the fold is closed.
  const width = atWidth(true);
  try {
    let tree = drawTab();
    const at = (t) => textOf(byTestId(t, "rec-row-tone"));
    const rest = at(tree);
    openFold(tree, "tone");
    tree = redrawTab();
    const sheet = foldOf(tree, "tone");
    assert.equal(sheet.props.role, "dialog");
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "rec-row-tone").length, 1, "one row, behind the sheet");
    assert.equal(at(tree), rest, "saying what it said");
    assert.equal(byTestId(sheet, "rec-row-tone"), null, "and not inside the dialog");
    assert.ok(
      find(byTestId(tree, "rec-card-answers"), (n) => n.props?.["data-testid"] === "rec-row-tone"),
      "in its own card",
    );
  } finally {
    width.put();
  }
  // At a desktop's width the fold is a sheet too (RecordFold frame="sheet"), and the row stays behind it the same way.
  let tree = drawTab();
  openFold(tree, "tone");
  tree = redrawTab();
  assert.equal(foldOf(tree, "tone").props.role, "dialog");
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "rec-row-tone").length, 1, "one row, behind the sheet");
  assert.equal(byTestId(foldOf(tree, "tone"), "rec-row-tone"), null, "and not inside the dialog");
});

test("the line the page marks as changed is the line the kit draws as a new element, and no other", () => {
  // changedLines (surfaces/settings/business/folds.ts) says which lines of a block are new; RecordSays keys each line by its words
  // and which time they occur, so a line that is new to the browser is drawn as a new element, which is what lets the
  // wash play once as it arrives. The two must agree: a marked line that kept its element would never wash, and an
  // unmarked line that arrived new is simply drawn. Both count occurrences in order, so of two lines alike the LATER
  // is the new one on both sides. Only a blank line may be new without being marked: blank lines are never a change.
  const changedLines = W.__businessTabSave.changedLines;
  const keysOf = (text) => {
    const tree = W.React.createElement(W.RecordSays, { text });
    return all(
      find(tree, (n) => n.type === "pre"),
      (n) => n.type === W.React.Fragment,
    ).map((f) => f.props.key);
  };
  const cases = [
    ["reordered", "Mon: 9-5\nTue: 9-5\nWed: closed", "Wed: closed\nMon: 9-5\nTue: 9-5"],
    [
      "a duplicate added",
      "- Walk-ins welcome\n- Parking at the back",
      "- Walk-ins welcome\n- Parking at the back\n- Walk-ins welcome",
    ],
    [
      "a duplicate removed",
      "- Walk-ins welcome\n- Walk-ins welcome\n- Parking at the back",
      "- Walk-ins welcome\n- Parking at the back",
    ],
    [
      "blank lines",
      "Booking rules:\n- At least 2 hours' notice.\n\nHours:",
      "Booking rules:\n- At least 3 hours' notice.\n\n\nHours:",
    ],
    ["one line rewritten", "Tone: warm\nLanguages: English", "Tone: calm\nLanguages: English"],
    ["no change", "Tone: warm", "Tone: warm"],
  ];
  for (const [what, was, now] of cases) {
    const before = new Set(keysOf(was));
    const lines = now.split("\n");
    const fresh = keysOf(now)
      .map((k, i) => (before.has(k) ? null : i))
      .filter((i) => i != null);
    const marked = changedLines(was, now);
    assert.deepEqual(
      fresh.filter((i) => lines[i].trim() !== ""),
      marked,
      `${what}: the marked lines are the new elements`,
    );
    for (const i of fresh.filter((i) => !marked.includes(i))) {
      assert.equal(lines[i].trim(), "", `${what}: only a blank line arrives unmarked`);
    }
  }
  assert.deepEqual(
    changedLines("- Walk-ins welcome", "- Walk-ins welcome\n- Walk-ins welcome"),
    [1],
    "the later of two",
  );
  // A block that appears is arriving, not changing; one that goes marks nothing.
  assert.deepEqual(changedLines(null, "Tone: warm"), []);
  assert.deepEqual(changedLines("Tone: warm", null), []);
});

test("at rest a whole record draws every row's act, quietly, and five controls an owner acts on without looking for it", () => {
  const drawn = drawnAtRest(drawTab());
  const isAct = (c) => classes(c.n).includes("rec-row-act");
  assert.deepEqual(
    drawn.filter((c) => !isAct(c)).map((c) => c.id),
    [
      // Where the carrier record is asked, a link in Who you are's foot sentence: part of what it says.
      "rec-who-carriers",
      // When someone wants to book: the answer is the row's value, and a press of it offers the three (18 Oct 2026).
      "booking_choice-menu",
      // Walk-ins (decision 0073): the answer is the row's value, as the booking row's is.
      "walk_ins-menu",
      // Look at a photo: its switch, on its ability's row (18 Oct 2026: it sat in the rules fold, among limits).
      "rec-can-vision-switch",
      // Read it: what the receptionist is told.
      "rec-prompt-open",
      // When someone asks a price, on Autonomy's Limits: the answer, as the booking row's is.
      "price_choice-menu",
    ],
  );
  // Every row with an act draws it, one each, in its own row: nothing is latent any more.
  const acts = drawn.filter(isAct);
  assert.ok(acts.length >= 20, `every row's act: ${acts.length}`);
  assert.ok(
    acts.every((c) => c.row && c.row.props["data-act"] === "true"),
    "each in a row that says it is a press",
  );
  assert.equal(new Set(acts.map((c) => c.row)).size, acts.length, "one act to a row");
  // Nothing is missing from this record, so there is no gap line and no door.
  assert.equal(byTestId(drawTab(), "rec-gap-door"), null);
});

test("at rest an empty record adds only what is empty or missing, and the gap line's door", () => {
  const drawn = drawnAtRest(drawTab({ profile: {} }));
  const why = (c) =>
    c.id === "rec-prompt-open" || c.id === "rec-who-carriers"
      ? "always"
      : c.id === "rec-gap-door"
        ? "the gap"
        : classes(c.n).includes("rec-row-act")
          ? "a row's act, drawn at rest"
          : /^rec-can-door-/.test(c.id)
            ? "missing"
            : c.id === "booking_choice-menu" || c.id === "price_choice-menu" || c.id === "walk_ins-menu"
              ? "a question's answer, drawn as its row's value"
              : c.id === "rec-can-vision-switch"
                ? "the photo switch, on its ability's row"
                : null;
  assert.deepEqual(
    drawn.filter((c) => !why(c)).map((c) => c.id),
    [],
    "nothing else is drawn at rest",
  );
  assert.ok(
    drawn.some((c) => c.id === "rec-gap-door"),
    "the gap line's one link",
  );
});

test("any business may empty its booking link, and the key goes rather than an empty one", () => {
  const sent = saving();
  const flash = () => {};
  const tree = drawTab({ flash });
  openFold(tree, "booking_link");
  typeInto(redrawTab(flash), "booking_link", "   ");
  saveRow(redrawTab(flash), "booking_link");
  assert.equal(sent.length, 1, "optional for every business (0008, amended 18 Oct 2026)");
  assert.equal(
    Object.prototype.hasOwnProperty.call(sent[0].config.brain, "booking_link"),
    false,
    "an empty one would fail the read's web-address check, and AI would go quiet",
  );
});

test("with no booking link, the row says what AI does instead, for every business", () => {
  const without = { booking_link: undefined };
  assert.match(
    textOf(byTestId(drawTab({ brain: without }), "rec-row-booking_link")),
    /None — it takes their details instead/,
  );
});
