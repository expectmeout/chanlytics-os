/**
 * Settings › Business, *When you're open*, EXECUTED on the stub React: the week as a ribbon and a fold, the zone, the
 * closed days, and the calendar it reads. The page, the fixture and the presses are _business-tab-harness.mjs; every
 * claim here is something the page drew, or something a press on it sent.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  standingLine,
  PROFILE_CROSSING_WORDS,
  hasProfile,
  hoursLines,
  openWeekWords,
  closuresAheadWords,
  toCalendarVM,
  zoneDayKey,
  hoursZoneWords,
  CALENDAR_FEED_WORDS,
  timezoneWords,
  knownTimezones,
  MAX_INTERVALS_PER_DAY,
  MAX_CLOSURES,
} from "@chanlytics/contracts";
import { unmount, settle, all, find, byTestId, textOf, classes, press, quiet, redrawWanted } from "./_legacy-react.mjs";
import {
  KNOWN,
  W,
  cancelFoldOf,
  cancelRow,
  composed,
  dayOf,
  drawTab,
  escape,
  foldOf,
  inline,
  labelled,
  melany,
  openFold,
  openFolds,
  openRows,
  partsOf,
  problemUnder,
  redrawTab,
  saveFoldOf,
  saveRow,
  saving,
  settings,
  typeAt,
  went,
  without,
  written,
} from "./_business-tab-harness.mjs";

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

const barsOf = (node) => all(node, (n) => classes(n).includes("bt-ribbon-bar"));
/** A shift's place in its day, as its box is named: the second, third, fourth shift. */
const place = (n) => ["", "", "second", "third", "fourth", "fifth", "sixth"][n];
/** The week's one menu: open it, then press the copy it names. */
const copyTo = (tree, flash, words) => {
  press(find(byTestId(tree, "rec-hours-copy"), (n) => n.type === "button" && n.props["aria-haspopup"] === "menu"));
  const opened = redrawTab(flash);
  press(find(byTestId(opened, "rec-hours-copy"), (n) => n.props?.role === "menuitem" && textOf(n) === words));
  return redrawTab(flash);
};
/** The card's summary is the composer's own run-collapsing, joined. Never a second implementation. */
const summaryOf = (hours) => hoursLines(hours).join(" · ");

test("When you're open draws four rows in the spec's order, under a line contracts wrote", () => {
  const card = byTestId(drawTab(), "rec-card-open");
  assert.deepEqual(all(card, (n) => classes(n).includes("rec-row-key")).map(textOf), [
    "Hours",
    "Timezone",
    "Days you're closed",
    "Calendar it reads",
  ]);
  assert.equal(textOf(find(card, (n) => classes(n).includes("rec-card-title"))), "When you're open");
  assert.equal(
    textOf(find(card, (n) => classes(n).includes("rec-card-sub"))),
    openWeekWords(melany.hours, "America/New_York"),
  );
  assert.equal(
    openWeekWords(melany.hours, "America/New_York"),
    "Six days a week, in New York time",
    "the canvas's line, from contracts",
  );
  // Between Who you are and What you offer, on the one page.
  assert.deepEqual(
    all(drawTab(), (n) => classes(n).includes("rec-card")).map((n) => n.props["data-testid"]),
    ["rec-card-who", "rec-card-open", "rec-card-offer", "rec-card-answers", "rec-card-can", "rec-card-told"],
  );
});

test("the ribbon draws the week, and a closed day carries no bar", () => {
  const ribbon = byTestId(drawTab({ profile: melany }), "bt-hours-ribbon");
  const days = all(ribbon, (n) => classes(n).includes("bt-ribbon-day"));
  assert.equal(days.length, 7);
  assert.deepEqual(
    days.map((d) => d.props["data-day"]),
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  );
  const sunday = days[6];
  assert.equal(
    find(sunday, (n) => classes(n).includes("bt-ribbon-bar")),
    null,
    "Sunday is shut, and looks it",
  );
  assert.deepEqual(
    days.map((d) => barsOf(d).length),
    [1, 1, 1, 1, 1, 1, 0],
  );
  // A picture of the sentence under it: a screen reader is given the sentence alone.
  assert.equal(ribbon.props["aria-hidden"], "true");
});

test("a bar's place comes from its times on the one 6 AM to 10 PM scale: a break is a second bar, and a time outside the scale clamps", () => {
  const place = (bar) => [parseFloat(bar.props.style.left), parseFloat(bar.props.style.width)];
  const days = (tree) => all(byTestId(tree, "bt-hours-ribbon"), (n) => classes(n).includes("bt-ribbon-day"));
  // 9:30 is three and a half hours into a sixteen-hour scale, and 6 PM twelve: the canvas's 21.875% and 53.125%.
  assert.deepEqual(place(barsOf(days(drawTab())[0])[0]), [21.875, 53.125]);
  assert.deepEqual(
    place(barsOf(days(drawTab())[4])[0]),
    [21.875, 59.375],
    "Friday closes an hour later, and is an hour longer",
  );
  const odd = {
    ...melany.hours,
    tue: {
      intervals: [
        { open: "09:30", close: "13:30" },
        { open: "14:00", close: "18:00" },
      ],
    },
    wed: { open: "05:00", close: "23:30" },
    thu: { open: "22:30", close: "23:30" },
  };
  const tree = drawTab({ profile: { ...melany, hours: odd } });
  assert.deepEqual(
    barsOf(days(tree)[1]).map(place),
    [
      [21.875, 25],
      [50, 25],
    ],
    "a lunch break is the gap between two bars on the same row",
  );
  assert.deepEqual(
    place(barsOf(days(tree)[2])[0]),
    [0, 100],
    "open before six and after ten: clamped to the scale's edges",
  );
  const late = place(barsOf(days(tree)[3])[0]);
  assert.ok(
    late[1] > 0 && late[0] + late[1] === 100,
    "wholly outside the scale, it is still a sliver at the edge: a day that is open never looks shut",
  );
  // And the day still reads in full in the sentence under the ribbon, whatever the ribbon could draw of it.
  assert.equal(textOf(byTestId(tree, "rec-hours-line")), summaryOf(odd));
  assert.match(summaryOf(odd), /5 AM – 11:30 PM/);
});

test("the summary sentence is the one the composer wrote", () => {
  const row = byTestId(drawTab({ profile: melany }), "rec-row-hours");
  assert.match(textOf(row), new RegExp(escape(summaryOf(melany.hours))));
  assert.equal(
    textOf(byTestId(row, "rec-hours-line")),
    summaryOf(melany.hours),
    "word for word, joined as hoursSummary joins them",
  );
});

test("with no hours stored, the row is empty in the old card's words, and its act adds them", () => {
  const tree = drawTab({ profile: without(melany, "hours") });
  const row = byTestId(tree, "rec-row-hours");
  assert.equal(row.props["data-empty"], "true");
  assert.match(textOf(row), /Not set — the receptionist cannot state your hours/);
  assert.equal(byTestId(tree, "bt-hours-ribbon"), null, "no week to draw");
  const act = byTestId(tree, "rec-row-act-hours");
  assert.equal(textOf(act), "Add them");
  assert.ok(act.props["aria-label"].startsWith("Add them"), "a person who says the words on it reaches it");
  assert.equal(
    textOf(find(byTestId(tree, "rec-card-open"), (n) => classes(n).includes("rec-card-sub"))),
    "Times are in New York time",
  );
});

test("the hours fold is the week on one scale: a switch, the bars and the times for each day, in the zone the receptionist states them in", () => {
  let tree = drawTab();
  assert.deepEqual(openFolds(tree), []);
  assert.equal(foldOf(tree, "hours").props.hidden, true, "drawn, and hidden until it is asked for");
  openFold(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["hours"]);
  // A sheet beside the page (RecordFold frame="sheet", at a desktop's width too): the row stays in its card behind
  // it, never inside it.
  const fold = foldOf(tree, "hours");
  assert.equal(fold.props.role, "dialog", "a sheet, not a fold under the row");
  assert.equal(byTestId(fold, "rec-row-hours"), null, "the row is not inside the sheet");
  assert.ok(byTestId(tree, "rec-row-hours"), "and still in its card behind it");
  assert.equal(fold.props["data-wide"], "true", "its own grid names each day");
  // The zone by the name the card above it already uses (openWeekWords: "in New York time"), never the IANA id: an
  // owner setting their opening hours has no use for "America/New_York", and it is the machine's name for the place.
  assert.equal(textOf(find(fold, (n) => classes(n).includes("rec-sheet-sub"))), hoursZoneWords("America/New_York"));
  assert.equal(hoursZoneWords("America/New_York"), "All times in New York time, as the receptionist states them.");
  assert.equal(textOf(byTestId(tree, "rec-fold-save-hours")), "Save the week");
  assert.deepEqual(
    all(fold, (n) => n.props?.role === "switch").map((s) => [s.props["aria-label"], s.props["aria-checked"]]),
    [
      ["Monday", true],
      ["Tuesday", true],
      ["Wednesday", true],
      ["Thursday", true],
      ["Friday", true],
      ["Saturday", true],
      ["Sunday", false],
    ],
  );
  assert.deepEqual(
    [
      labelled(fold, "Monday opens").props.value,
      labelled(fold, "Monday closes").props.value,
      labelled(fold, "Monday opens").props.type,
    ],
    ["09:30", "18:00", "time"],
  );
  assert.deepEqual(
    ["mon", "sun"].map((d) => barsOf(dayOf(tree, d)).length),
    [1, 0],
    "the bars beside the boxes that draw them",
  );
  assert.match(textOf(dayOf(tree, "sun")), /Closed/);
  assert.equal(labelled(fold, "Sunday opens"), null, "a closed day offers no boxes");
  // The zone is the one the settings read resolved the prompt in.
  tree = drawTab({ zone: "America/Chicago" });
  assert.equal(
    // Drawn afresh the fold is closed and hidden whole, in the row's frame: its hint is the head's, not a sheet's.
    textOf(find(foldOf(tree, "hours"), (n) => classes(n).includes("rec-fold-hint"))),
    hoursZoneWords("America/Chicago"),
  );
  assert.equal(hoursZoneWords("America/Chicago"), "All times in Chicago time, as the receptionist states them.");
});

test("an hours save sends the stored config with the week changed, and everything else as it was", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = written(W.__SETTINGS.config);
  openFold(tree, "hours");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab(flash);
  assert.equal(labelled(tree, "Monday closes").props.value, "17:00");
  assert.equal(W.__settingsUnsaved(), true, "the rail and the browser ask before the week is thrown away");
  saveFoldOf(tree, "hours");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].version, 7);
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: {
      ...stored.brain,
      profile: { ...stored.brain.profile, hours: { ...melany.hours, mon: { open: "09:30", close: "17:00" } } },
    },
  });
  assert.equal(textOf(flashes.at(-1).msg), "Saved — the receptionist picks it up within a minute");
  assert.deepEqual(openFolds(redrawTab(flash)), [], "accepted, the fold closes");
});

test("an unchanged fold's Save sends nothing and closes it, and Cancel with changes asks first", () => {
  const sent = saving();
  let tree = drawTab();
  for (const id of ["hours", "closures", "calendar"]) {
    openFold(tree, id);
    tree = redrawTab();
    assert.deepEqual(openFolds(tree), [id]);
    saveFoldOf(tree, id);
    tree = redrawTab();
    assert.deepEqual(openFolds(tree), [], `${id}: nothing to write is nothing to send`);
  }
  assert.equal(sent.length, 0);
  // A change typed and typed back is no change either.
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "18:00");
  tree = redrawTab();
  saveFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual([sent.length, openFolds(tree)], [0, []]);

  openFold(tree, "hours");
  tree = redrawTab();
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), [], "nothing changed, nothing asked");
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["hours"], "not thrown away yet");
  assert.match(textOf(byTestId(tree, "rec-fold-hours-cancel-confirm")), /Discard your changes\?/);
  press(byTestId(tree, "rec-fold-hours-cancel-yes"));
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), []);
  openFold(tree, "hours");
  tree = redrawTab();
  assert.equal(labelled(tree, "Monday closes").props.value, "18:00", "and it opens on what is stored");
});

test("a closed day keeps its shifts until Save, which is what decides a closed day stores nothing", () => {
  const sent = saving();
  let tree = drawTab();
  const stored = written(W.__SETTINGS.config);
  openFold(tree, "hours");
  tree = redrawTab();
  press(byTestId(tree, "rec-hours-switch-sat"));
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-hours-switch-sat").props["aria-checked"], false);
  assert.match(textOf(dayOf(tree, "sat")), /Closed — times kept/);
  assert.equal(barsOf(dayOf(tree, "sat")).length, 0, "shut, and looks it");
  // An accidental tap costs nothing: the times are there when the day opens again.
  press(byTestId(tree, "rec-hours-switch-sat"));
  tree = redrawTab();
  assert.deepEqual(
    [labelled(tree, "Saturday opens").props.value, labelled(tree, "Saturday closes").props.value],
    ["09:30", "19:00"],
  );
  press(byTestId(tree, "rec-hours-switch-sat"));
  tree = redrawTab();
  saveFoldOf(tree, "hours");
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: { ...stored.brain, profile: { ...stored.brain.profile, hours: { ...melany.hours, sat: {} } } },
  });
  // A day that never had times opens with one empty shift to type into.
  tree = drawTab();
  openFold(tree, "hours");
  tree = redrawTab();
  press(byTestId(tree, "rec-hours-switch-sun"));
  tree = redrawTab();
  assert.deepEqual([labelled(tree, "Sunday opens").props.value, labelled(tree, "Sunday closes").props.value], ["", ""]);
});

test("a shift typed half-way is said under its day, and overlapping shifts in the schema's words, and neither is sent", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  // Sunday opened and half typed: the save would drop the shift and store Sunday as closed, which changes nothing, so
  // a week that "holds no changes" must still be refused rather than closed as if saved.
  press(byTestId(tree, "rec-hours-switch-sun"));
  tree = redrawTab(flash);
  typeAt(tree, "Sunday opens", "10:00");
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  assert.deepEqual([sent.length, flashes.length], [0, 0], "nothing sent, and nothing said in a toast");
  assert.deepEqual(openFolds(tree), ["hours"], "the fold stays open with what was typed");
  const said = byTestId(tree, "rec-hours-problem-sun");
  assert.equal(textOf(said), "Sunday needs both an opening and a closing time, or neither.");
  assert.ok(
    find(dayOf(tree, "sun"), (k) => k === said),
    "under its own day",
  );
  const box = labelled(tree, "Sunday opens");
  assert.deepEqual(
    [box.props["aria-invalid"], box.props["aria-describedby"]],
    [true, said.props.id],
    "and its boxes are described by it",
  );
  assert.equal(byTestId(tree, "rec-hours-problem-mon"), null);
  assert.equal(
    byTestId(tree, "rec-fold-says-hours"),
    null,
    "a draft the page refuses is never told to the receptionist",
  );
  // Typing in that day takes its sentence away.
  typeAt(tree, "Sunday closes", "14:00");
  tree = redrawTab(flash);
  assert.equal(byTestId(tree, "rec-hours-problem-sun"), null);
  assert.ok(byTestId(tree, "rec-fold-says-hours"));

  // Two shifts that overlap: no one box is wrong, so only the save's own schema can say it, under their day.
  press(byTestId(tree, "rec-hours-add-mon"));
  tree = redrawTab(flash);
  typeAt(tree, "Monday opens, second shift", "12:00");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes, second shift", "20:00");
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  assert.equal(textOf(byTestId(tree, "rec-hours-problem-mon")), "Monday: two shifts overlap.");
  assert.deepEqual([sent.length, openFolds(tree)], [0, ["hours"]]);
});

test("a day takes shifts up to the cap the save's schema keeps, and a removed shift comes back where it was", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  for (let n = 2; n <= MAX_INTERVALS_PER_DAY; n += 1) {
    assert.ok(byTestId(tree, "rec-hours-add-mon"), `a shift ${n} may be added`);
    press(byTestId(tree, "rec-hours-add-mon"));
    tree = redrawTab(flash);
    typeAt(tree, `Monday opens, ${place(n)} shift`, `1${n}:00`);
    tree = redrawTab(flash);
  }
  assert.equal(byTestId(tree, "rec-hours-add-mon"), null, "at the cap, no more is offered: the save would refuse it");
  assert.ok(byTestId(tree, "rec-hours-add-tue"), "each day has its own");
  assert.equal(
    byTestId(tree, "rec-hours-remove-mon-0"),
    null,
    "the first shift has no remove: the switch already means closed",
  );
  const opens = () =>
    all(dayOf(tree, "mon"), (n) => n.type === "input" && / opens(,|$)/.test(n.props["aria-label"])).map(
      (n) => n.props.value,
    );
  assert.deepEqual(opens(), ["09:30", "12:00", "13:00", "14:00"]);
  press(byTestId(tree, "rec-hours-remove-mon-1"));
  tree = redrawTab(flash);
  assert.deepEqual(opens(), ["09:30", "13:00", "14:00"]);
  assert.match(textOf(flashes.at(-1).msg), /Removed the Mon shift at 12:00/);
  flashes.at(-1).undo();
  tree = redrawTab(flash);
  assert.deepEqual(opens(), ["09:30", "12:00", "13:00", "14:00"], "back at its index, not at the end");
});

test("copying a day says what it opened and what it overwrote, and puts it all back", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  // ONE menu, named for the day it copies, where the form had two links inches apart on Monday's row.
  const trigger = find(
    byTestId(tree, "rec-hours-copy"),
    (n) => n.type === "button" && n.props["aria-haspopup"] === "menu",
  );
  assert.match(textOf(trigger), /^Copy Monday to…/);
  assert.equal(all(tree, (n) => n.type === "button" && n.props["aria-haspopup"] === "menu").length, 1);
  tree = copyTo(tree, flash, "Every day");

  const said = flashes.at(-1);
  assert.match(textOf({ props: { children: said.msg } }), /Sun/, "the day that was closed is named");
  assert.match(textOf({ props: { children: said.msg } }), /Fri|Sat/, "and the days whose own hours went");
  assert.equal(
    textOf({ props: { children: said.msg } }),
    "Copied Mon's hours — Sun was closed and is now open, and replaced different hours on Fri, Sat",
  );
  assert.equal(typeof said.undo, "function", "the whole grid goes back in one press");
  assert.equal(barsOf(dayOf(tree, "sun")).length, 1, "Sunday is open, as Monday is");
  assert.deepEqual(
    [labelled(tree, "Sunday closes").props.value, labelled(tree, "Friday closes").props.value],
    ["18:00", "18:00"],
  );

  said.undo();
  tree = redrawTab(flash);
  assert.equal(barsOf(dayOf(tree, "sun")).length, 0, "Sunday is shut again");
  assert.equal(byTestId(tree, "rec-hours-switch-sun").props["aria-checked"], false);
  assert.equal(labelled(tree, "Friday closes").props.value, "19:00", "and Friday has its own hours back");

  // To the weekdays, as the old link copied; and to one day by its name. Nothing surprising, nothing named.
  tree = copyTo(tree, flash, "Weekdays");
  assert.equal(
    textOf({ props: { children: flashes.at(-1).msg } }),
    "Copied Mon's hours — replaced different hours on Fri",
  );
  assert.equal(labelled(tree, "Saturday closes").props.value, "19:00", "Saturday is no weekday");
  tree = copyTo(tree, flash, "Tuesday");
  assert.equal(textOf({ props: { children: flashes.at(-1).msg } }), "Copied Mon's hours — nothing else changed");

  // A business shut on Mondays copies the first day it is open.
  tree = drawTab({ flash, profile: { ...melany, hours: { ...melany.hours, mon: {} } } });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  assert.match(
    textOf(find(byTestId(tree, "rec-hours-copy"), (n) => n.type === "button" && n.props["aria-haspopup"] === "menu")),
    /^Copy Tuesday to…/,
  );
  // An Undo pressed after the fold has closed puts nothing back: the draft it would go into went with the fold. It
  // says so, rather than doing nothing and saying nothing.
  tree = copyTo(tree, flash, "Every day");
  const copied = flashes.at(-1);
  cancelFoldOf(tree, "hours");
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-fold-hours-cancel-yes"));
  tree = redrawTab(flash);
  copied.undo();
  tree = redrawTab(flash);
  assert.deepEqual([openFolds(tree), W.__settingsUnsaved()], [[], false]);
  assert.deepEqual(
    [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
    ["warn", "Not put back — the editor it was in has closed. Open it again to change it."],
  );
  // And one pressed while the fold's save is out: nothing is typed into a save on its way, and that is said too.
  W.__saveSettings = () => new Promise(() => {});
  tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  tree = copyTo(tree, flash, "Every day");
  const undoCopy = flashes.at(-1).undo;
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  undoCopy();
  tree = redrawTab(flash);
  assert.equal(
    byTestId(tree, "rec-hours-switch-sun").props["aria-checked"],
    true,
    "Sunday is still open: nothing was put back under the save",
  );
  assert.deepEqual(
    [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
    ["warn", "Not put back — this is being saved."],
  );
});

test("the hours fold says what the receptionist will be told as the draft stands, what goes, and when a week is the last thing a record composes from", () => {
  let tree = drawTab();
  const stored = W.__SETTINGS.config.brain;
  openFold(tree, "hours");
  tree = redrawTab();
  let says = byTestId(tree, "rec-fold-says-hours");
  assert.deepEqual(
    partsOf(says),
    [["Your receptionist will be told", composed("hours", stored).join("\n")]],
    "unchanged: the block as it stands, under the canvas's eyebrow",
  );
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  says = byTestId(tree, "rec-fold-says-hours");
  const next = {
    ...stored,
    profile: { ...melany, hours: { ...melany.hours, mon: { open: "09:30", close: "17:00" } } },
  };
  // The hours block's lines are runs of days: a changed Monday re-cuts them, and the lines that fall out of the old
  // block are about days nobody changed. So nothing is said to go while the block stays (the folds test holds the
  // rule); the whole new block says what Monday becomes.
  assert.deepEqual(partsOf(says), [["Your receptionist will be told", composed("hours", next).join("\n")]]);
  assert.match(textOf(says), /17:00/, "it follows the draft");

  // Every day closed, on a record that still composes: the block goes whole, line by line.
  for (const d of ["mon", "tue", "wed", "thu", "fri", "sat"]) {
    press(byTestId(tree, `rec-hours-switch-${d}`));
    tree = redrawTab();
  }
  assert.deepEqual(partsOf(byTestId(tree, "rec-fold-says-hours")), [
    ["It will no longer be told", composed("hours", stored).join("\n")],
  ]);
  assert.equal(
    byTestId(tree, "rec-fold-says-hours-note"),
    null,
    "the address and the rest still compose: no line crossed",
  );

  // The week is the last field this record composes from: closing it hands the receptionist its stored prompt.
  const sent = saving();
  const sparse = {
    hours: { mon: { open: "09:30", close: "18:00" } },
    handoff_number: "+16465550100",
    guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true },
  };
  assert.deepEqual([hasProfile(sparse), hasProfile(without(sparse, "hours"))], [true, false]);
  tree = drawTab({ profile: sparse, resolved: KNOWN });
  openFold(tree, "hours");
  tree = redrawTab();
  press(byTestId(tree, "rec-hours-switch-mon"));
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-fold-says-hours-note")), PROFILE_CROSSING_WORDS.stops);
  saveFoldOf(tree, "hours");
  assert.equal(sent.length, 1, "not a refusal: the save still goes");
  assert.equal("hours" in sent[0].config.brain.profile, false);
});

test("the standing line's hours door opens the fold, and the fold asks before its changes go like any other", () => {
  let tree = drawTab({ profile: without(melany, "hours") });
  const gap = standingLine(W.__SETTINGS.config.brain, true).missing;
  assert.equal(gap.row, "hours");
  const door = byTestId(byTestId(tree, "rec-standing"), "rec-standing-door");
  const heard = door.props["aria-labelledby"]
    .split(" ")
    .map((id) => find(tree, (n) => n.props?.id === id))
    .filter(Boolean)
    .map(textOf)
    .join(" ");
  assert.equal(heard, `${gap.sentence} Add them Hours`, "the sentence, then the act of the row it opens");
  press(door);
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["hours"]);
  press(byTestId(tree, "rec-hours-switch-mon"));
  tree = redrawTab();
  typeAt(tree, "Monday opens", "09:00");
  // Asked at once, before the page has drawn again: the keystroke is already what the registry reads. Half a shift is
  // nothing the save would write, and it is still something a person typed.
  assert.equal(W.__settingsUnsaved(), true, "the rail asks before the pane goes");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  const unload = {
    type: "beforeunload",
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  W.dispatchEvent(unload);
  assert.equal(unload.prevented, true, "the browser asks before the tab closes");
  openFold(tree, "website");
  tree = redrawTab();
  assert.deepEqual(
    [openFolds(tree), openRows(tree)],
    [["hours"], []],
    "another row's act does not throw the week away",
  );
  assert.match(textOf(byTestId(tree, "rec-fold-hours-ask-confirm")), /Discard your changes\?/);
  press(byTestId(tree, "rec-fold-hours-ask-no"));
  tree = redrawTab();
  assert.equal(labelled(tree, "Monday opens").props.value, "09:00", "keep editing keeps what was typed");
  openFold(tree, "website");
  tree = redrawTab();
  press(byTestId(tree, "rec-fold-hours-ask-yes"));
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), openRows(tree)], [[], ["website"]], "discarded, the row asked for opens");
});

test("while the week saves its boxes and switches take nothing, and what is asked of it waits for the save's answer", () => {
  const sent = [];
  W.__saveSettings = (config, version, accepted) =>
    new Promise(() => {
      sent.push({
        config: structuredClone(config),
        accept: () => accepted({ config: structuredClone(config), version: version + 1 }),
      });
    });
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  assert.deepEqual(
    [foldOf(tree, "hours").props["aria-busy"], textOf(byTestId(tree, "rec-fold-save-hours"))],
    [true, "Saving…"],
  );
  assert.deepEqual(
    [labelled(tree, "Monday closes").props.readOnly, byTestId(tree, "rec-hours-switch-mon").props["aria-disabled"]],
    [true, true],
  );
  typeAt(tree, "Monday closes", "16:00");
  press(byTestId(tree, "rec-hours-switch-tue"));
  press(byTestId(tree, "rec-hours-add-mon"));
  tree = redrawTab(flash);
  assert.deepEqual(
    [
      labelled(tree, "Monday closes").props.value,
      byTestId(tree, "rec-hours-switch-tue").props["aria-checked"],
      labelled(tree, "Monday opens, second shift"),
    ],
    ["17:00", true, null],
    "nothing typed or pressed under Saving… is held, to be dropped when it lands",
  );
  assert.equal(
    find(byTestId(tree, "rec-hours-copy"), (n) => n.type === "button" && n.props["aria-haspopup"] === "menu").props[
      "aria-disabled"
    ],
    true,
  );
  // It does not give way while its save is out, whatever its dirty test says: the ask waits, undrawn, and the save's
  // answer opens the row that was asked for.
  openFold(tree, "website");
  tree = redrawTab(flash);
  assert.deepEqual(
    [openFolds(tree), openRows(tree), byTestId(tree, "rec-fold-hours-ask-confirm")],
    [["hours"], [], null],
  );
  press(byTestId(tree, "rec-fold-close-hours"));
  tree = redrawTab(flash);
  assert.deepEqual(openFolds(tree), ["hours"], "Close is Cancel, and nothing cancels a save that is out");
  sent[0].accept();
  tree = redrawTab(flash);
  assert.deepEqual([openFolds(tree), openRows(tree)], [[], ["website"]]);
  assert.equal(sent[0].config.brain.profile.hours.mon.close, "17:00");
});

/* ---- the zone ---- */

test("the timezone row says the zone and the time there, and saves through the workspace's own door, never the settings save", async () => {
  const sent = saving();
  const asked = [];
  const flashes = [];
  const flash = (f) => flashes.push(f);
  W.__workspace = {
    setTimezone: async (tz) => {
      asked.push(tz);
      W.__WORKSPACES = W.__WORKSPACES.map((t) => ({ ...t, timezone: tz }));
      return { ok: true, tz, message: "" };
    },
  };
  try {
    let tree = drawTab({ flash });
    const row = byTestId(tree, "rec-row-timezone");
    assert.equal(
      textOf(find(row, (n) => classes(n).includes("rec-row-value"))),
      timezoneWords("America/New_York").line,
      "contracts' words: the zone, and the local time there now",
    );
    openFold(tree, "timezone");
    tree = redrawTab(flash);
    assert.deepEqual(openRows(tree), ["timezone"]);
    // The kit's combobox over every zone the runtime knows, where the old row had a select of 418 options.
    const box = () => find(inline(tree, "timezone"), (n) => n.props?.role === "combobox");
    assert.equal(box().props.value, "America/New York");
    box().props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
    tree = redrawTab(flash);
    assert.equal(all(inline(tree, "timezone"), (n) => n.props?.role === "option").length, knownTimezones().length);
    box().props.onChange({ target: { value: "denver" } });
    tree = redrawTab(flash);
    const options = all(inline(tree, "timezone"), (n) => n.props?.role === "option");
    assert.deepEqual(options.map(textOf), ["America/Denver"]);
    press(options[0]);
    tree = redrawTab(flash);
    assert.equal(box().props.value, "America/Denver");
    assert.match(
      textOf(byTestId(tree, "rec-inline-timezone-note")),
      new RegExp(escape(timezoneWords("America/Denver").line)),
      "its consequence is the local time beside it",
    );
    assert.equal(W.__settingsUnsaved(), true);
    // This device's zone, in one press.
    const device = byTestId(tree, "rec-inline-timezone-device");
    assert.equal(textOf(device), "Use this device’s (Chicago)");
    press(device);
    tree = redrawTab(flash);
    assert.equal(box().props.value, "America/Chicago");
    assert.equal(byTestId(tree, "rec-inline-timezone-device"), null, "already chosen, no longer offered");
    // No prompt block of its own: the zone is the workspace's, and no draft of the brain holds it.
    assert.equal(byTestId(tree, "rec-inline-says-timezone"), null);
    assert.equal(
      find(inline(tree, "timezone"), (n) => classes(n).includes("rec-says")),
      null,
      "it draws no It will say",
    );

    saveRow(tree, "timezone");
    tree = redrawTab(flash);
    assert.deepEqual(
      [byTestId(tree, "rec-inline-save-timezone").props["aria-busy"], box().props.readOnly],
      [true, true],
      "busy, and its box takes nothing meanwhile",
    );
    await settle();
    tree = redrawTab(flash);
    assert.deepEqual(asked, ["America/Chicago"]);
    assert.equal(sent.length, 0, "the settings save is never sent: the zone is the workspace's");
    assert.deepEqual(openRows(tree), [], "taken, the editor closes");
    assert.equal(
      textOf({ props: { children: flashes.at(-1).msg } }),
      "Your day is measured in Chicago now.",
      "the old row's words",
    );
    assert.equal(
      textOf(find(byTestId(tree, "rec-row-timezone"), (n) => classes(n).includes("rec-row-value"))),
      timezoneWords("America/Chicago").line,
    );

    // Unchanged, Save sends nothing; refused, the owner is told in the server's words and the editor stays.
    openFold(tree, "timezone");
    tree = redrawTab(flash);
    saveRow(tree, "timezone");
    await settle();
    tree = redrawTab(flash);
    assert.deepEqual([asked.length, openRows(tree)], [1, []]);
    W.__workspace.setTimezone = async () => ({ ok: false, tz: "", message: "Only the owner can change the timezone." });
    openFold(tree, "timezone");
    tree = redrawTab(flash);
    press(byTestId(tree, "rec-inline-timezone-device") || { props: { onClick() {} } });
    box().props.onChange({ target: { value: "denver" } });
    tree = redrawTab(flash);
    press(all(inline(tree, "timezone"), (n) => n.props?.role === "option")[0]);
    tree = redrawTab(flash);
    saveRow(tree, "timezone");
    await settle();
    tree = redrawTab(flash);
    assert.deepEqual(
      [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
      ["danger", "Only the owner can change the timezone."],
    );
    assert.deepEqual(openRows(tree), ["timezone"]);
    // Cancel with a change asks first.
    cancelRow(tree, "timezone");
    tree = redrawTab(flash);
    assert.match(textOf(byTestId(tree, "rec-inline-timezone-cancel-confirm")), /Discard your changes\?/);
  } finally {
    delete W.__workspace;
  }
});

/* ---- the days the week does not apply to ---- */

const XMAS = { date: "2099-12-24", until: "2099-12-26", note: "Christmas" };
const NEW_YEAR = { date: "2100-01-01", note: "New Year's Day" };

test("the closed days ahead are counted on the business's own day, and none ahead says so with its act", () => {
  // At any instant it is a later date on Kiritimati (UTC+14) than on Pago Pago (UTC-11). A closure on Pago Pago's today
  // is still ahead there, and already past on Kiritimati, whatever zone this machine is in.
  const now = Date.now();
  const earlier = zoneDayKey(now, "Pacific/Pago_Pago");
  assert.ok(zoneDayKey(now, "Pacific/Kiritimati") > earlier);
  const profile = { ...melany, closures: [{ date: earlier, note: "Stocktake" }] };
  let row = byTestId(drawTab({ profile, zone: "Pacific/Pago_Pago" }), "rec-row-closures");
  assert.equal(
    textOf(find(row, (n) => classes(n).includes("rec-row-value"))),
    closuresAheadWords(profile.closures, "Pacific/Pago_Pago", new Date(now)).line,
  );
  assert.match(textOf(row), /^Days you're closed1 ahead · /);
  row = byTestId(drawTab({ profile, zone: "Pacific/Kiritimati" }), "rec-row-closures");
  assert.equal(row.props["data-empty"], "true", "the same closure, already past where the business is");
  assert.match(textOf(row), /None ahead/);

  // Melany keeps none: the canvas's empty row.
  const tree = drawTab();
  assert.match(textOf(byTestId(tree, "rec-row-closures")), /None ahead/);
  assert.equal(textOf(byTestId(tree, "rec-row-act-closures")), "Add one");
  // Two ahead, the next one named as the Calendar's own list names it.
  assert.match(
    textOf(byTestId(drawTab({ profile: { ...melany, closures: [NEW_YEAR, XMAS] } }), "rec-row-closures")),
    /2 ahead · next Dec 24 – 26 · Christmas/,
  );
});

test("the closures fold adds, edits and removes a closed day, puts a removed one back where it was, and saves only the closures", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash, profile: { ...melany, closures: [XMAS, NEW_YEAR] } });
  const stored = written(W.__SETTINGS.config);
  openFold(tree, "closures");
  tree = redrawTab(flash);
  assert.deepEqual(openFolds(tree), ["closures"]);
  const rows = () => all(foldOf(tree, "closures"), (n) => /^rec-closure-\d+$/.test(n.props?.["data-testid"] || ""));
  const dates = () => rows().map((r) => all(r, (n) => n.type === "input").map((n) => n.props.value));
  assert.deepEqual(dates(), [
    ["2099-12-24", "2099-12-26", "Christmas"],
    ["2100-01-01", "", "New Year's Day"],
  ]);
  // Native date boxes on purpose: 31 November cannot be typed at all.
  assert.deepEqual(
    all(rows()[0], (n) => n.type === "input").map((n) => n.props.type),
    ["date", "date", "text"],
  );
  // Each box is named for its row, by its date once there is one, so a screen reader can tell one row from the next.
  assert.deepEqual(
    all(rows()[0], (n) => n.type === "input").map((n) => n.props["aria-label"]),
    ["Closed from, 2099-12-24", "Closed until, 2099-12-24", "Reason, 2099-12-24"],
  );
  assert.match(
    textOf(foldOf(tree, "closures")),
    /Closing early rather than all day\? Leave it out of this list and set that day's hours above instead\./,
    "the old form's note, for the one case this cannot express",
  );
  assert.match(textOf(byTestId(tree, "rec-fold-says-closures")), /Christmas/, "the closures block, as it stands");

  press(byTestId(tree, "rec-closures-add"));
  tree = redrawTab(flash);
  const third = rows()[2];
  all(third, (n) => n.type === "input")[0].props.onChange({ target: { value: "2100-07-04" } });
  tree = redrawTab(flash);
  all(rows()[2], (n) => n.type === "input")[2].props.onChange({ target: { value: "Independence Day" } });
  tree = redrawTab(flash);
  assert.match(
    textOf(byTestId(tree, "rec-fold-says-closures")),
    /Independence Day/,
    "what it will be told follows the draft",
  );

  press(byTestId(tree, "rec-closure-remove-0"));
  tree = redrawTab(flash);
  assert.deepEqual(
    dates().map((d) => d[0]),
    ["2100-01-01", "2100-07-04"],
  );
  assert.equal(textOf({ props: { children: flashes.at(-1).msg } }), "Removed 2099-12-24 — Christmas");
  flashes.at(-1).undo();
  tree = redrawTab(flash);
  assert.deepEqual(
    dates().map((d) => d[0]),
    ["2099-12-24", "2100-01-01", "2100-07-04"],
    "back at its index",
  );

  press(byTestId(tree, "rec-closure-remove-1"));
  tree = redrawTab(flash);
  saveFoldOf(tree, "closures");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].config, {
    ...stored,
    brain: {
      ...stored.brain,
      profile: { ...stored.brain.profile, closures: [XMAS, { date: "2100-07-04", note: "Independence Day" }] },
    },
  });
  assert.equal(textOf(flashes.at(-1).msg), "Saved — the receptionist picks it up within a minute");
});

test("what stops a closures save is said under its own box, and at the cap the fold says so and offers no more", () => {
  const sent = saving();
  let tree = drawTab({ profile: { ...melany, closures: [XMAS] } });
  openFold(tree, "closures");
  tree = redrawTab();
  const boxes = () => all(byTestId(tree, "rec-closure-0"), (n) => n.type === "input");
  boxes()[2].props.onChange({ target: { value: "x".repeat(201) } });
  tree = redrawTab();
  saveFoldOf(tree, "closures");
  tree = redrawTab();
  assert.match(textOf(problemUnder(tree, "rec-closure-0-note")), /At most 200 characters — this is 201\./);
  assert.deepEqual(
    [boxes()[2].props["aria-invalid"], boxes()[0].props["aria-invalid"]],
    [true, undefined],
    "under the box it is about, and no other",
  );
  // Only the schema can judge these two, and each lands under its own box.
  boxes()[2].props.onChange({ target: { value: "Christmas" } });
  tree = redrawTab();
  boxes()[1].props.onChange({ target: { value: "2099-12-20" } });
  tree = redrawTab();
  saveFoldOf(tree, "closures");
  tree = redrawTab();
  assert.ok(
    textOf(problemUnder(tree, "rec-closure-0-until")),
    "an until before its date is the schema's to refuse, under Until",
  );
  assert.equal(problemUnder(tree, "rec-closure-0-note"), null);
  assert.equal(sent.length, 0);

  // The cap, from the bridge's published limit: the old sentence, and no Add.
  const many = Array.from({ length: MAX_CLOSURES }, (_, i) => ({
    date: `2099-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + Math.floor(i / 12)).padStart(2, "0")}`,
  }));
  tree = drawTab({ profile: { ...melany, closures: many } });
  openFold(tree, "closures");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-closures-add"), null);
  assert.equal(
    textOf(byTestId(tree, "rec-closures-cap")),
    `That is the most closures the receptionist keeps (${MAX_CLOSURES}). Dates that have passed can go.`,
  );
  press(byTestId(tree, "rec-closure-remove-0"));
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-closures-add"), "one fewer, and one may be added again");
});

/* ---- the calendar it reads ---- */

/** The Calendar surface as the bridge publishes it: contracts' own view model of the route's answer, read just now. */
const calendarRead = (feed, agoMs = 0) => {
  const today = zoneDayKey(Date.now(), "America/New_York");
  const dto = {
    timezone: "America/New_York",
    from: today,
    to: today,
    feed,
    hours: melany.hours,
    closures: [],
    rules: null,
    services: [],
    booking_link: null,
    next_opening: null,
    days: [{ key: today, items: [], windows: [] }],
  };
  return { vm: toCalendarVM(dto, new Date()), fetchedAt: Date.now() - agoMs };
};
const readOk = (over = {}) => ({
  present: true,
  source: "Google Calendar",
  state: "ok",
  read_at: new Date(Date.now() - 4 * 60000).toISOString(),
  checked_at: new Date(Date.now() - 4 * 60000).toISOString(),
  events: 12,
  recurring_expanded: 0,
  skipped_recurring: 0,
  reason: null,
  status: null,
  problem: null,
  stale: false,
  dropped: 0,
  ...over,
});

test("the calendar row says where it reads and when, and keeps the address, the count and the source in its fold", () => {
  W.__CALENDAR = calendarRead(readOk());
  try {
    const tree = drawTab({ profile: melany });
    const row = byTestId(tree, "rec-row-calendar");
    assert.equal(
      find(row, (n) => /Check the address/i.test(textOf(n))),
      null,
      "a row that can say it needs no button",
    );
    // At rest: the host it reads, when it was last read, and one mark that says whether that worked. The words the
    // mark carries are the Calendar page's, in its accessible name and under a pointer -- not a pill of its own.
    assert.equal(textOf(find(row, (n) => classes(n).includes("bt-feed-where"))), "app.chanlytics.com");
    const mark = byTestId(row, "rec-calendar-state");
    assert.equal(mark.props["aria-label"], CALENDAR_FEED_WORDS.ok);
    assert.equal(mark.props["data-tip"], CALENDAR_FEED_WORDS.ok);
    assert.equal(textOf(mark), "", "a mark, not a word on the row");
    assert.equal(textOf(byTestId(row, "rec-calendar-read")), W.__CALENDAR.vm.feed.read);
    assert.equal(W.__CALENDAR.vm.feed.read, "read 4m ago");
    // And nothing else: no secret of an address, no count of events, no "from" anybody.
    const words = textOf(byTestId(row, "rec-row-calendar"));
    assert.doesNotMatch(words, /\.ics/, "the whole address is a long secret, read over a shoulder");
    assert.doesNotMatch(words, /\d+ events?/);
    assert.doesNotMatch(words, /From Google Calendar/);
    assert.deepEqual(
      all(row, (n) => n.type === "button").map((b) => b.props["data-testid"]),
      ["rec-row-act-calendar"],
    );
    // Opened, the fold holds the address whole, and the whole of what the last read found.
    openFold(tree, "calendar");
    const open = redrawTab();
    const box = find(foldOf(open, "calendar"), (n) => classes(n).includes("rec-input"));
    assert.equal(box.props.value, "https://app.chanlytics.com/api/v1/calendar/filler.ics", "the address, whole");
    assert.equal(textOf(byTestId(open, "rec-calendar-whole")), W.__CALENDAR.vm.feed.detail);
    assert.match(W.__CALENDAR.vm.feed.detail, /From Google Calendar · read 4m ago · 12 events/);
    // A read that failed says in the fold what it tried and when, which the row at rest leaves to the reason.
    W.__CALENDAR = calendarRead(
      readOk({
        state: "unavailable",
        read_at: null,
        events: 0,
        reason: "http",
        status: 404,
        problem: "The calendar answered 404.",
      }),
    );
    const bad = redrawTab();
    assert.match(textOf(byTestId(bad, "rec-calendar-whole")), /tried 4m ago/);
  } finally {
    delete W.__CALENDAR;
  }
});

test("a calendar that could not be read says so in the Calendar page's words; with no read, the row says nothing of one and asks", () => {
  const was = { calendar: W.__calendar, failed: W.__surfaceFailed };
  try {
    // The last read failed: the pill, the reason as the owner can act on it, and when it was tried.
    W.__CALENDAR = calendarRead(
      readOk({
        state: "unavailable",
        read_at: null,
        events: 0,
        reason: "http",
        status: 404,
        problem: "The calendar answered 404: the address no longer points at a calendar.",
      }),
    );
    let row = byTestId(drawTab(), "rec-row-calendar");
    assert.equal(byTestId(row, "rec-calendar-state").props["aria-label"], CALENDAR_FEED_WORDS.unavailable);
    assert.match(textOf(row), /The calendar answered 404: the address no longer points at a calendar\./);
    assert.doesNotMatch(textOf(row), /tried 4m ago/, "when it was tried is in the fold, with the rest of the read");
    assert.doesNotMatch(textOf(row), /\d+ events?/, "no count is claimed of a calendar that was not read");
    // A last good read, shown as that.
    W.__CALENDAR = calendarRead(
      readOk({ stale: true, reason: "unreachable", problem: "The calendar could not be reached." }),
    );
    row = byTestId(drawTab(), "rec-row-calendar");
    assert.equal(byTestId(row, "rec-calendar-state").props["aria-label"], CALENDAR_FEED_WORDS.stale);
    assert.match(textOf(row), /The calendar could not be reached\./);
    // With no reason given, each state is said in the Calendar page's own words for it, from where that page keeps
    // them: a last good read could not be REFRESHED, which is not the sentence for a calendar that could not be read.
    W.__CALENDAR = calendarRead(readOk({ stale: true, reason: "unreachable", problem: null }));
    row = byTestId(drawTab(), "rec-row-calendar");
    assert.equal(textOf(find(row, (n) => classes(n).includes("bt-feed-problem"))), W.__calendarPage.words.stale);
    assert.equal(W.__calendarPage.words.stale, "The calendar could not be refreshed.");
    W.__CALENDAR = calendarRead(
      readOk({ state: "unavailable", read_at: null, events: 0, reason: null, problem: null }),
    );
    row = byTestId(drawTab(), "rec-row-calendar");
    assert.equal(textOf(find(row, (n) => classes(n).includes("bt-feed-problem"))), W.__calendarPage.words.unavailable);

    // No read in this tab: nothing is invented. The address is still stated.
    delete W.__CALENDAR;
    const asked = [];
    W.__calendar = {
      refresh: () => {
        asked.push("refresh");
        return Promise.resolve(true);
      },
    };
    let tree = drawTab();
    row = byTestId(tree, "rec-row-calendar");
    assert.equal(byTestId(row, "rec-calendar-read"), null);
    assert.equal(
      textOf(find(row, (n) => classes(n).includes("rec-row-val"))),
      "app.chanlytics.com",
      "REGRESSION guard: where it reads, and never a read it does not have",
    );
    assert.deepEqual(asked, ["refresh"], "it asks for one as it mounts");
    // And says what that finds when it lands.
    W.__CALENDAR = calendarRead(readOk({ events: 3 }));
    W.dispatchEvent({ type: "surface:calendar" });
    tree = redrawTab();
    assert.equal(textOf(byTestId(tree, "rec-calendar-read")), W.__CALENDAR.vm.feed.read);
    assert.equal(asked.length, 1, "fresh, it is not asked for again");
    // The surface itself could not be read: said where the line would be, with the one Retry.
    delete W.__CALENDAR;
    W.__surfaceFailed = (key) => key === "calendar";
    row = byTestId(drawTab(), "rec-row-calendar");
    assert.match(textOf(byTestId(row, "rec-calendar-unread")), /Couldn't read what its last read found/);
  } finally {
    delete W.__CALENDAR;
    if (was.calendar) W.__calendar = was.calendar;
    else delete W.__calendar;
    if (was.failed) W.__surfaceFailed = was.failed;
    else delete W.__surfaceFailed;
  }
});

test("with no feed the calendar row is empty and says what the address is for; its fold holds the one box, checked under it, and saves only the address", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  W.__CALENDAR = calendarRead(readOk());
  try {
    let tree = drawTab({ flash, config: { calendar: undefined } });
    const stored = written(W.__SETTINGS.config);
    const row = byTestId(tree, "rec-row-calendar");
    assert.equal(row.props["data-empty"], "true");
    assert.match(textOf(row), /Not connected/);
    assert.match(
      textOf(row),
      /Read-only, so it can say which times are open before sending the link\./,
      "the old form's sentence for what the address is",
    );
    assert.equal(byTestId(row, "rec-calendar-read"), null, "and no read is stated of a calendar that is not connected");
    assert.equal(textOf(byTestId(tree, "rec-row-act-calendar")), "Add one");
    openFold(tree, "calendar");
    tree = redrawTab(flash);
    const fold = foldOf(tree, "calendar");
    assert.match(textOf(fold), /The private iCal address of the calendar your appointments land in/);
    assert.match(
      textOf(fold),
      /It is only ever read\. Nothing is booked from here; the booking link does that, whichever tool is behind it\./,
    );
    assert.equal(byTestId(tree, "rec-calendar-open"), null, "no door to a calendar that is not connected");
    assert.equal(
      find(fold, (n) => classes(n).includes("rec-says")),
      null,
      "the address is in no draft of the brain: it draws no block",
    );
    const box = () => find(foldOf(tree, "calendar"), (n) => classes(n).includes("rec-input"));
    box().props.onChange({ target: { value: "calendar.google.com/basic.ics" } });
    tree = redrawTab(flash);
    saveFoldOf(tree, "calendar");
    tree = redrawTab(flash);
    assert.equal(box().props["aria-invalid"], true);
    assert.match(
      textOf(foldOf(tree, "calendar")),
      /The calendar feed needs to be a full address, starting with https:\/\/ or webcal:\/\//,
    );
    assert.equal(sent.length, 0);
    box().props.onChange({
      target: { value: "  https://calendar.google.com/calendar/ical/melany/private-abc/basic.ics  " },
    });
    tree = redrawTab(flash);
    assert.equal(box().props["aria-invalid"], undefined, "typing again takes the sentence away");
    saveFoldOf(tree, "calendar");
    assert.deepEqual(sent[0].config, {
      ...without(stored, "calendar"),
      calendar: { ical_url: "https://calendar.google.com/calendar/ical/melany/private-abc/basic.ics" },
    });

    // A feed is stored: the fold keeps the door to the Calendar, and an emptied box disconnects it.
    tree = drawTab({ flash });
    const held = written(W.__SETTINGS.config);
    openFold(tree, "calendar");
    tree = redrawTab(flash);
    went.length = 0;
    press(byTestId(tree, "rec-calendar-open"));
    assert.deepEqual(went, ["calendar"]);
    box().props.onChange({ target: { value: "" } });
    tree = redrawTab(flash);
    saveFoldOf(tree, "calendar");
    assert.deepEqual(sent[1].config, without(held, "calendar"));

    // Anyone but the owner is sent the address masked: shown as it arrives, said to be hidden, and an untouched fold
    // sends nothing, so the mask is never saved over the address.
    tree = drawTab({ flash, config: { calendar: { ical_url: "https://calendar.google.c…ic.ics" } } });
    assert.equal(
      textOf(find(byTestId(tree, "rec-row-calendar"), (n) => classes(n).includes("bt-feed-where"))),
      "Your calendar",
      "a masked address is no address to take a host out of: the row names what it is instead",
    );
    openFold(tree, "calendar");
    tree = redrawTab(flash);
    assert.match(textOf(byTestId(tree, "rec-calendar-masked")), /Only an owner sees this address whole/);
    saveFoldOf(tree, "calendar");
    tree = redrawTab(flash);
    assert.deepEqual([sent.length, openFolds(tree)], [2, []]);
  } finally {
    delete W.__CALENDAR;
  }
});

test("a viewer reads when the business is open and is offered no act on any of it", () => {
  W.ST_STORE = { can: (perm) => perm !== "settings", myRole: () => "viewer" };
  W.__workspace = { setTimezone: async () => ({ ok: true, tz: "America/Chicago", message: "" }) };
  W.__CALENDAR = calendarRead(readOk());
  try {
    const tree = drawTab({ profile: { ...melany, closures: [XMAS] } });
    const card = byTestId(tree, "rec-card-open");
    assert.deepEqual(
      all(card, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || "")),
      [],
      "no row offers a change",
    );
    assert.match(textOf(card), new RegExp(escape(summaryOf(melany.hours))));
    assert.match(textOf(card), /1 ahead · Dec 24 – 26 · Christmas/);
    // The whole of the last read, on the ROW: where it read from, when, and how many events. A viewer never opens a
    // fold (below), so the fold is no place to keep it from them -- they read the record, all of it.
    assert.equal(textOf(byTestId(card, "rec-calendar-read")), W.__CALENDAR.vm.feed.detail);
    assert.match(W.__CALENDAR.vm.feed.detail, /From Google Calendar · read 4m ago · 12 events/);
    // A read that failed is the same: what it tried, and when, where an owner would open the fold for it.
    W.__CALENDAR = calendarRead(
      readOk({
        state: "unavailable",
        read_at: null,
        events: 0,
        reason: "http",
        status: 404,
        problem: "The calendar answered 404.",
      }),
    );
    const failed = byTestId(drawTab({ profile: { ...melany, closures: [XMAS] } }), "rec-row-calendar");
    assert.match(textOf(failed), /tried 4m ago/, "a viewer reads what the last try was, too");
    assert.match(textOf(failed), /The calendar answered 404\./);
    W.__CALENDAR = calendarRead(readOk());
    // Nothing opens an editor for it, whatever asks.
    for (const id of ["hours", "timezone", "closures", "calendar"]) {
      W.__recordFolds.request(id);
      const again = redrawTab();
      assert.deepEqual([openFolds(again), openRows(again)], [[], []], id);
      W.__recordFolds.reset();
    }
  } finally {
    delete W.ST_STORE;
    delete W.__workspace;
    delete W.__CALENDAR;
  }
});

test("each act of When you're open is gated as a change to the settings, and named for what it acts on", () => {
  const asked = [];
  const was = W.gate;
  W.gate = (perm, doing) => {
    asked.push([perm, doing]);
    return {};
  };
  W.__workspace = { setTimezone: async () => ({ ok: true, tz: "", message: "" }) };
  try {
    const tree = drawTab();
    const mine = asked.filter(([, doing]) => /hours|timezone|closed|calendar/.test(doing));
    assert.deepEqual(mine, [
      ["settings", "change your hours"],
      ["settings", "change the timezone"],
      ["settings", "change the days you are closed"],
      ["settings", "change the calendar it reads"],
    ]);
    const heard = (row) => {
      const act = byTestId(tree, `rec-row-act-${row}`);
      return (
        act.props["aria-label"] ||
        act.props["aria-labelledby"]
          .split(" ")
          .map((id) => textOf(find(tree, (n) => n.props?.id === id)))
          .join(" ")
      );
    };
    assert.deepEqual(["hours", "timezone", "closures", "calendar"].map(heard), [
      "Change your opening hours",
      "Change Timezone",
      "Add one: a day you are closed",
      "Change the calendar it reads",
    ]);
  } finally {
    W.gate = was;
    delete W.__workspace;
  }
});

test("a refusal that is not the fold's to fix is said once in the fold, and never stops a fold that has nothing to write from closing", () => {
  // A stored closure on a date that is not on the calendar: the save's schema refuses the whole brain for it, whichever
  // fold is saving.
  const sent = saving();
  let tree = drawTab({ profile: { ...melany, closures: [{ date: "2099-02-31", note: "Not a day" }] } });
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "18:00");
  tree = redrawTab();
  saveFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(
    [sent.length, openFolds(tree)],
    [0, []],
    "typed and typed back: nothing to write, so nothing of the record is judged",
  );
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  saveFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual([sent.length, openFolds(tree)], [0, ["hours"]]);
  assert.match(
    textOf(byTestId(tree, "rec-fold-hours-elsewhere")),
    /^Something else in your settings stops this save — /,
    "said where the owner is looking, naming where it is",
  );
  assert.equal(byTestId(tree, "rec-hours-problem-mon"), null, "and under no day, since no day is wrong");
});

test("under Saving…, a press that would add or remove changes nothing and toasts nothing: it refuses the way Save does", () => {
  // The spec review's probe. update refused the change while the save was out, and the body toasted anyway: "Removed the
  // Mon shift at 14:00", with an Undo, of a shift that was still there.
  W.__saveSettings = () => new Promise(() => {});
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const held = (node) => [node.props["aria-disabled"], node.props.disabled];
  const two = {
    ...melany,
    hours: {
      ...melany.hours,
      mon: {
        intervals: [
          { open: "09:30", close: "13:00" },
          { open: "14:00", close: "18:00" },
        ],
      },
    },
  };
  let tree = drawTab({ flash, profile: two });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  assert.deepEqual(
    [held(byTestId(tree, "rec-hours-remove-mon-1")), held(byTestId(tree, "rec-hours-add-tue"))],
    [
      [undefined, undefined],
      [undefined, undefined],
    ],
    "pressable until the week is sent",
  );
  typeAt(tree, "Tuesday closes", "17:00");
  tree = redrawTab(flash);
  // The week's menu is open, with its copies on screen, as Save is pressed.
  press(find(byTestId(tree, "rec-hours-copy"), (n) => n.type === "button" && n.props["aria-haspopup"] === "menu"));
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  // Pressed in the same breath as Save, before the page has drawn again: the press is still live on screen, so it is
  // update that answers, by whether it took the change, and the body says nothing of a change it did not make.
  let before = flashes.length;
  press(byTestId(tree, "rec-hours-remove-mon-1"));
  press(find(byTestId(tree, "rec-hours-copy"), (n) => n.props?.role === "menuitem" && textOf(n) === "Every day"));
  assert.deepEqual(flashes.slice(before), [], "update took nothing, and said so: no shift removed, no week copied");
  tree = redrawTab(flash);
  assert.ok(labelled(tree, "Monday opens, second shift"));
  assert.equal(
    byTestId(tree, "rec-hours-switch-sun").props["aria-checked"],
    false,
    "Sunday was not opened by a copy that did not happen",
  );
  assert.equal(textOf(byTestId(tree, "rec-fold-save-hours")), "Saving…");
  // Focusable, saying they are not to be pressed, and never `disabled`, which lets go of focus: as Save is.
  assert.deepEqual(
    [held(byTestId(tree, "rec-hours-remove-mon-1")), held(byTestId(tree, "rec-hours-add-tue"))],
    [
      [true, undefined],
      [true, undefined],
    ],
  );
  before = flashes.length;
  press(byTestId(tree, "rec-hours-remove-mon-1"));
  press(byTestId(tree, "rec-hours-add-tue"));
  tree = redrawTab(flash);
  assert.ok(labelled(tree, "Monday opens, second shift"), "the shift is still there");
  assert.equal(labelled(tree, "Tuesday opens, second shift"), null, "and no break was added");
  assert.deepEqual(
    flashes.slice(before).map((f) => textOf({ props: { children: f.msg } })),
    [],
    "nothing was removed, so nothing says it was",
  );

  tree = drawTab({ flash, profile: { ...melany, closures: [XMAS, NEW_YEAR] } });
  openFold(tree, "closures");
  tree = redrawTab(flash);
  all(byTestId(tree, "rec-closure-1"), (n) => n.type === "input")[2].props.onChange({ target: { value: "New Year" } });
  tree = redrawTab(flash);
  saveFoldOf(tree, "closures");
  before = flashes.length;
  press(byTestId(tree, "rec-closure-remove-0"));
  assert.deepEqual(flashes.slice(before), [], "the same, of a closed day removed in the same breath as Save");
  tree = redrawTab(flash);
  assert.deepEqual(
    [held(byTestId(tree, "rec-closure-remove-0")), held(byTestId(tree, "rec-closures-add"))],
    [
      [true, undefined],
      [true, undefined],
    ],
  );
  before = flashes.length;
  press(byTestId(tree, "rec-closure-remove-0"));
  press(byTestId(tree, "rec-closures-add"));
  tree = redrawTab(flash);
  assert.equal(
    all(foldOf(tree, "closures"), (n) => /^rec-closure-\d+$/.test(n.props?.["data-testid"] || "")).length,
    2,
    "both closed days are still there, and no third",
  );
  assert.deepEqual(flashes.slice(before), [], "and nothing toasts a removal that did not happen");
});

test("Cancel, another row and the rail ask before throwing away anything typed, whether or not the save would have written it", () => {
  // The spec review's probe. "Holds changes" was judged by what the save would write, so a shift typed half-way, a
  // closed day's note with no date yet, or a day switched on with no times read as nothing: Cancel closed at once and
  // the input was gone without a question. The form this replaces counted any change. What Save SENDS is still judged
  // by what it would write.
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "hours");
  tree = redrawTab();
  press(byTestId(tree, "rec-hours-switch-sun"));
  tree = redrawTab();
  typeAt(tree, "Sunday opens", "10:00");
  tree = redrawTab();
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["hours"], "not thrown away");
  assert.match(textOf(byTestId(tree, "rec-fold-hours-cancel-confirm")), /Discard your changes\?/);
  press(byTestId(tree, "rec-fold-hours-cancel-no"));
  tree = redrawTab();
  assert.equal(labelled(tree, "Sunday opens").props.value, "10:00", "keep editing keeps it");
  // Another row's act, and the rail, the same.
  assert.equal(W.__settingsUnsaved(), true);
  openFold(tree, "website");
  tree = redrawTab();
  assert.deepEqual(
    [openFolds(tree), openRows(tree), !!byTestId(tree, "rec-fold-hours-ask-confirm")],
    [["hours"], [], true],
  );
  press(byTestId(tree, "rec-fold-hours-ask-no"));
  tree = redrawTab();
  // Put back as it opened, it holds nothing again: Cancel closes at once.
  typeAt(tree, "Sunday opens", "");
  tree = redrawTab();
  press(byTestId(tree, "rec-hours-switch-sun"));
  tree = redrawTab();
  assert.equal(W.__settingsUnsaved(), true, "a closed day keeps its one empty shift, which is not how it opened");
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  press(byTestId(tree, "rec-fold-hours-cancel-yes"));
  tree = redrawTab();
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "18:00");
  tree = redrawTab();
  assert.equal(W.__settingsUnsaved(), false, "typed and typed back is the week it opened with");
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), []);

  // A closed day's note with no date yet: a row the save would drop, and words somebody typed.
  openFold(tree, "closures");
  tree = redrawTab();
  press(byTestId(tree, "rec-closures-add"));
  tree = redrawTab();
  all(byTestId(tree, "rec-closure-0"), (n) => n.type === "input")[2].props.onChange({
    target: { value: "Staff training" },
  });
  tree = redrawTab();
  cancelFoldOf(tree, "closures");
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), !!byTestId(tree, "rec-fold-closures-cancel-confirm")], [["closures"], true]);
  press(byTestId(tree, "rec-fold-closures-cancel-no"));
  tree = redrawTab();
  // And Save still sends nothing of it, and closes: nothing it holds is anything to write.
  saveFoldOf(tree, "closures");
  tree = redrawTab();
  assert.deepEqual([sent.length, openFolds(tree)], [0, []]);
});

test("a day switched on with no times is said under its day, and the week is not closed as if it had been saved", () => {
  // The save writes a day with no times as closed, so the week "changed nothing", and the fold closed without a word
  // with the owner's Sunday gone.
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-hours-switch-sun"));
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  assert.deepEqual([sent.length, flashes.length, openFolds(tree)], [0, 0, ["hours"]]);
  assert.equal(
    textOf(byTestId(tree, "rec-hours-problem-sun")),
    "Sunday is switched on with no times. Give it an opening and a closing time, or switch it off.",
  );
  assert.equal(labelled(tree, "Sunday opens").props["aria-invalid"], true, "on the boxes it is about");
  assert.equal(
    byTestId(tree, "rec-fold-says-hours"),
    null,
    "and nothing is told to the receptionist of a week the page refuses",
  );
  // Either answer takes the sentence away: its times, or the switch.
  typeAt(tree, "Sunday opens", "10:00");
  tree = redrawTab(flash);
  typeAt(tree, "Sunday closes", "14:00");
  tree = redrawTab(flash);
  assert.equal(byTestId(tree, "rec-hours-problem-sun"), null);
  saveFoldOf(tree, "hours");
  assert.deepEqual(
    sent.map((s) => s.config.brain.profile.hours.sun),
    [{ open: "10:00", close: "14:00" }],
  );
});

/**
 * The page's clock and its timers, held by the test: what is scheduled is recorded, and runs when the test says. The
 * last page drawn goes first, with the real clearTimeout, so no real timer of its (the calendar row's five minutes)
 * outlives the fake clock; and a handle the fake did not make is cleared by the real one. `live()` counts only the
 * calendar row's own timer, by the name the row gives it (btoReadExpires): a toast's setTimeout is not the row's.
 */
const clock = () => {
  unmount();
  const real = { now: Date.now, set: globalThis.setTimeout, clear: globalThis.clearTimeout };
  const timers = [];
  let at = real.now();
  Date.now = () => at;
  globalThis.setTimeout = (fn, ms) => {
    const t = { fn, ms, at: at + ms, cleared: false };
    timers.push(t);
    return t;
  };
  globalThis.clearTimeout = (t) => {
    if (timers.includes(t)) t.cleared = true;
    else real.clear(t);
  };
  return {
    timers,
    live: () => timers.filter((t) => !t.cleared && !t.fired && t.fn.name === "btoReadExpires"),
    /** Time passes, and every timer due by then fires, in order. */
    pass(ms) {
      at += ms;
      for (const t of timers.filter((x) => !x.cleared && !x.fired && x.at <= at)) {
        t.fired = true;
        t.fn();
      }
    },
    /** The wall clock moves by `ms`, and every live timer fires whether or not it reads as due: a timer runs on the
     *  monotonic clock, so a wall clock stepped back, or one a browser coarsens, reads "not yet" as it fires. */
    early(ms) {
      at += ms;
      for (const t of timers.filter((x) => !x.cleared && !x.fired)) {
        t.fired = true;
        t.fn();
      }
    },
    restore() {
      Date.now = real.now;
      globalThis.setTimeout = real.set;
      globalThis.clearTimeout = real.clear;
    },
  };
};

test("an idle page stops stating a read when the Calendar page would have read again: one timer, at the read's own age", () => {
  // The spec review's probe: `fresh` was worked out as the row drew and nothing looked again, so a page left open said
  // "read 4m ago" for forty minutes.
  const was = { calendar: W.__calendar };
  const time = clock();
  const asked = [];
  W.__calendar = {
    refresh: () => {
      asked.push("refresh");
      return new Promise(() => {});
    },
  };
  try {
    const keeps = W.__calendarPage.refreshMs;
    assert.equal(keeps, 5 * 60 * 1000, "the Calendar page's own window, never a second number");
    W.__CALENDAR = calendarRead(readOk(), 60000);
    // A toast's own timer is not the row's, and does not count against ONE.
    globalThis.setTimeout(() => {}, 4000);
    let tree = drawTab();
    assert.equal(
      byTestId(tree, "rec-calendar-read").props["data-reading"],
      undefined,
      "a minute old: stated as it stands",
    );
    assert.deepEqual(
      time.live().map((t) => t.ms),
      [keeps - 60000],
      "ONE timer, for the moment this read stops being fresh",
    );
    assert.equal(time.timers.length, 2, "the toast's is recorded, and left out of the count");
    assert.equal(asked.length, 0);
    // Drawn again for any reason, it schedules no second one.
    tree = redrawTab();
    tree = redrawTab();
    assert.equal(time.live().length, 1);

    // Forty minutes pass with nothing pressed. The timer is what draws the row again.
    time.pass(40 * 60000);
    tree = redrawTab();
    assert.equal(asked.length, 1, "it asks for a new read");
    assert.equal(
      byTestId(tree, "rec-calendar-read").props["data-reading"],
      "true",
      "and no longer states the old one as it stands",
    );
    assert.equal(time.live().length, 0, "nothing is scheduled for a read that is not fresh");

    // The new read lands: stated, and the next timer is for ITS age.
    W.__CALENDAR = { ...calendarRead(readOk({ events: 3 })), fetchedAt: Date.now() };
    W.dispatchEvent({ type: "surface:calendar" });
    tree = redrawTab();
    assert.deepEqual(
      [
        byTestId(tree, "rec-calendar-read").props["data-reading"],
        textOf(byTestId(tree, "rec-calendar-read")) === W.__CALENDAR.vm.feed.read,
      ],
      [undefined, true],
    );
    assert.deepEqual(
      time.live().map((t) => t.ms),
      [keeps],
    );
    // The page goes: its timer goes with it.
    unmount();
    assert.equal(time.live().length, 0, "cleared as the row unmounts");

    // The quality review's probe. The timer fires a millisecond before the wall clock says the read is stale. Asked of
    // the clock again, the row read "still fresh", its effect's inputs had not moved, so no second timer was set and
    // nothing ever looked again: the very page the timer was added for. The timer decides: the read it was set for has
    // expired, whatever the clock says.
    W.__CALENDAR = { ...calendarRead(readOk()), fetchedAt: Date.now() };
    tree = drawTab();
    assert.deepEqual(
      time.live().map((t) => t.ms),
      [keeps],
    );
    const before = asked.length;
    time.early(keeps - 1);
    tree = redrawTab();
    assert.equal(byTestId(tree, "rec-calendar-read").props["data-reading"], "true", "no longer stated as it stands");
    assert.equal(asked.length, before + 1, "and a new read is asked for");
    // A newer read is judged afresh: the expiry was that read's, not the row's.
    W.__CALENDAR = { ...calendarRead(readOk({ events: 7 })), fetchedAt: Date.now() };
    W.dispatchEvent({ type: "surface:calendar" });
    tree = redrawTab();
    assert.deepEqual(
      [byTestId(tree, "rec-calendar-read").props["data-reading"], time.live().map((t) => t.ms)],
      [undefined, [keeps]],
    );
  } finally {
    time.restore();
    delete W.__CALENDAR;
    if (was.calendar) W.__calendar = was.calendar;
    else delete W.__calendar;
  }
});

test("while a new read is on its way the last one stays where it is, dimmed; it does not vanish and move the rows under it", async () => {
  const was = { calendar: W.__calendar };
  let land = null;
  W.__calendar = {
    refresh: () =>
      new Promise((resolve) => {
        land = resolve;
      }),
  };
  try {
    W.__CALENDAR = calendarRead(readOk(), 30 * 60000);
    let tree = drawTab();
    const read = byTestId(tree, "rec-calendar-read");
    assert.ok(read, "the last read is still drawn");
    assert.deepEqual(
      [read.props["data-reading"], read.props["aria-busy"]],
      ["true", true],
      "dimmed (spec 9: a read in flight dims the last value), and said to be busy",
    );
    assert.match(textOf(read), /read 4m ago/, "the same words, not a skeleton and not a gap");
    assert.equal(byTestId(tree, "rec-calendar-unread"), null);
    // Landed, it is stated plainly.
    W.__CALENDAR = calendarRead(readOk({ events: 9 }));
    W.dispatchEvent({ type: "surface:calendar" });
    land(true);
    await settle();
    tree = redrawTab();
    assert.deepEqual(
      [
        byTestId(tree, "rec-calendar-read").props["data-reading"],
        byTestId(tree, "rec-calendar-read").props["aria-busy"],
      ],
      [undefined, undefined],
    );
    assert.equal(textOf(byTestId(tree, "rec-calendar-read")), W.__CALENDAR.vm.feed.read);

    // No read is asked for from a tab nobody is looking at, as the Calendar page's own timer holds off; back in view,
    // the row looks again and asks.
    const asked = [];
    W.__calendar = {
      refresh: () => {
        asked.push("refresh");
        return new Promise(() => {});
      },
    };
    W.__CALENDAR = calendarRead(readOk(), 30 * 60000);
    globalThis.document.visibilityState = "hidden";
    tree = drawTab();
    assert.equal(asked.length, 0);
    globalThis.document.visibilityState = "visible";
    tree = redrawTab();
    assert.equal(asked.length, 1);
  } finally {
    delete globalThis.document.visibilityState;
    delete W.__CALENDAR;
    if (was.calendar) W.__calendar = was.calendar;
    else delete W.__calendar;
  }
});

test("a stale read whose refresh failed says so where the read would be, with a Retry, and never goes on stating the old one", async () => {
  // The spec review's probe: FailedRead drew only when there was no surface at all, so a read from half an hour ago
  // whose refresh had failed was stated as if nothing had happened, or not stated and not explained.
  const was = { calendar: W.__calendar, failed: W.__surfaceFailed };
  const answers = [];
  W.__calendar = { refresh: () => new Promise((resolve) => answers.push(resolve)) };
  try {
    W.__CALENDAR = calendarRead(readOk(), 30 * 60000);
    let tree = drawTab();
    assert.equal(byTestId(tree, "rec-calendar-read").props["data-reading"], "true", "asked, and on its way");
    answers[0](false);
    await settle();
    tree = redrawTab();
    const row = byTestId(tree, "rec-row-calendar");
    assert.equal(byTestId(row, "rec-calendar-read"), null, "the old read is not stated as if it were the latest");
    assert.match(textOf(byTestId(row, "rec-calendar-unread")), /Couldn't read what its last read found/);
    assert.doesNotMatch(textOf(row), /12 events|read 4m ago/);
    assert.match(textOf(row), /app\.chanlytics\.com/, "where it reads is still the settings read's, and still said");
    // Its Retry asks again, the last read comes back dimmed meanwhile, and a read that lands is stated.
    press(byTestId(row, "rec-calendar-unread-retry"));
    tree = redrawTab();
    assert.equal(answers.length, 2);
    // Retry keeps the block, busy, until its read answers: it flipped to the dimmed old read and back.
    assert.equal(
      byTestId(tree, "rec-calendar-read"),
      null,
      "REGRESSION: the old read came back, dimmed, under a Retry",
    );
    assert.equal(textOf(byTestId(tree, "rec-calendar-unread-retry")).trim(), "Retrying…");
    W.__CALENDAR = calendarRead(readOk({ events: 5 }));
    W.dispatchEvent({ type: "surface:calendar" });
    answers[1](true);
    await settle();
    tree = redrawTab();
    assert.equal(textOf(byTestId(tree, "rec-calendar-read")), W.__CALENDAR.vm.feed.read);
    assert.equal(byTestId(tree, "rec-calendar-unread"), null);
    // A refresh that throws is a refresh that failed.
    W.__calendar = { refresh: () => Promise.reject(new Error("offline")) };
    W.__CALENDAR = calendarRead(readOk(), 30 * 60000);
    tree = drawTab();
    await settle();
    tree = redrawTab();
    assert.ok(byTestId(tree, "rec-calendar-unread"));
    // And the runner's own word for it counts too: the surface is marked failed, with a stale read still in the window.
    W.__calendar = { refresh: () => new Promise(() => {}) };
    W.__surfaceFailed = (key) => key === "calendar";
    W.__CALENDAR = calendarRead(readOk(), 30 * 60000);
    tree = drawTab();
    assert.deepEqual([!!byTestId(tree, "rec-calendar-unread"), byTestId(tree, "rec-calendar-read")], [true, null]);
    // Its Retry, too, keeps the block busy: it showed nothing at all while the read was out.
    press(byTestId(tree, "rec-calendar-unread-retry"));
    tree = redrawTab();
    assert.deepEqual(
      [!!byTestId(tree, "rec-calendar-unread"), textOf(byTestId(tree, "rec-calendar-unread-retry")).trim()],
      [true, "Retrying…"],
    );
    // A fresh read is stated whatever the surface's status says of an earlier try.
    W.__CALENDAR = calendarRead(readOk());
    tree = drawTab();
    assert.deepEqual([byTestId(tree, "rec-calendar-unread"), !!byTestId(tree, "rec-calendar-read")], [null, true]);
  } finally {
    delete W.__CALENDAR;
    if (was.calendar) W.__calendar = was.calendar;
    else delete W.__calendar;
    if (was.failed) W.__surfaceFailed = was.failed;
    else delete W.__surfaceFailed;
  }
});

test("a list inside a fold keeps its cap through an Undo too: a removed row is put back only while there is room", () => {
  // The quality review's probe. Monday at four shifts, one removed, one added, then the toast's Undo: Monday held five,
  // past what the save's schema takes, and Save said only that it could not be saved as written.
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes", "10:00");
  tree = redrawTab(flash);
  for (let n = 2; n <= MAX_INTERVALS_PER_DAY; n += 1) {
    press(byTestId(tree, "rec-hours-add-mon"));
    tree = redrawTab(flash);
    typeAt(tree, `Monday opens, ${place(n)} shift`, `1${n}:00`);
    tree = redrawTab(flash);
    typeAt(tree, `Monday closes, ${place(n)} shift`, `1${n}:30`);
    tree = redrawTab(flash);
  }
  const opens = () =>
    all(dayOf(tree, "mon"), (n) => n.type === "input" && / opens(,|$)/.test(n.props["aria-label"])).map(
      (n) => n.props.value,
    );
  press(byTestId(tree, "rec-hours-remove-mon-1"));
  tree = redrawTab(flash);
  const undo = flashes.at(-1).undo;
  press(byTestId(tree, "rec-hours-add-mon"));
  tree = redrawTab(flash);
  typeAt(tree, `Monday opens, ${place(MAX_INTERVALS_PER_DAY)} shift`, "21:00");
  tree = redrawTab(flash);
  typeAt(tree, `Monday closes, ${place(MAX_INTERVALS_PER_DAY)} shift`, "21:30");
  tree = redrawTab(flash);
  assert.equal(byTestId(tree, "rec-hours-add-mon"), null, "at the cap");
  undo();
  tree = redrawTab(flash);
  assert.deepEqual(
    opens(),
    ["09:30", "13:00", "14:00", "21:00"],
    "the day still holds what the save takes, and what was typed since",
  );
  assert.deepEqual(
    [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
    ["warn", "Not put back — Monday already has the most shifts a day takes. Remove one first."],
    "and the Undo says why it did nothing",
  );
  saveFoldOf(tree, "hours");
  assert.equal(sent.length, 1, "so the week can be saved");
  assert.deepEqual(
    sent[0].config.brain.profile.hours.mon.intervals.map((s) => s.open),
    ["09:30", "13:00", "14:00", "21:00"],
  );

  // The closed days, the same: at the cap, a removed day is not put back over one added since.
  const many = Array.from({ length: MAX_CLOSURES }, (_, i) => ({
    date: `2099-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + Math.floor(i / 12)).padStart(2, "0")}`,
  }));
  tree = drawTab({ flash, profile: { ...melany, closures: many } });
  openFold(tree, "closures");
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-closure-remove-0"));
  tree = redrawTab(flash);
  const back = flashes.at(-1).undo;
  press(byTestId(tree, "rec-closures-add"));
  tree = redrawTab(flash);
  back();
  tree = redrawTab(flash);
  assert.equal(
    all(foldOf(tree, "closures"), (n) => /^rec-closure-\d+$/.test(n.props?.["data-testid"] || "")).length,
    MAX_CLOSURES,
  );
  assert.equal(flashes.at(-1).tone, "warn");
  // With room, it goes back where it was (the tests above), and says nothing more.

  // And Add itself keeps the cap, not only the button that offers it: pressed twice in one breath with room for one,
  // before the page has drawn again, one is added.
  tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  for (let n = 2; n < MAX_INTERVALS_PER_DAY; n += 1) {
    press(byTestId(tree, "rec-hours-add-tue"));
    tree = redrawTab(flash);
  }
  press(byTestId(tree, "rec-hours-add-tue"));
  press(byTestId(tree, "rec-hours-add-tue"));
  tree = redrawTab(flash);
  assert.equal(
    all(dayOf(tree, "tue"), (n) => n.type === "input" && / opens(,|$)/.test(n.props["aria-label"])).length,
    MAX_INTERVALS_PER_DAY,
  );
});

test("a zone being saved outlives the page that sent it: come back mid-save and the row is busy, and its answer throws nothing away", async () => {
  // The quality review's probe. The zone row kept "my save is out" in its own state, where every other row asks the
  // saver. The rail's "Yes, leave" took the pane away mid-save; back on it, the reopened editor was not busy and the
  // rail was told nothing was saving, so a new zone could be picked, and the OLD save's answer closed the new editor
  // and dropped the pick without a question.
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let answer = null;
  const asked = [];
  W.__workspace = {
    setTimezone: (tz) =>
      new Promise((resolve) => {
        asked.push(tz);
        answer = () => resolve({ ok: true, tz, message: "" });
      }),
  };
  try {
    let tree = drawTab({ flash });
    openFold(tree, "timezone");
    tree = redrawTab(flash);
    press(byTestId(tree, "rec-inline-timezone-device"));
    tree = redrawTab(flash);
    saveRow(tree, "timezone");
    tree = redrawTab(flash);
    assert.deepEqual([inline(tree, "timezone").props["aria-busy"], W.__settingsSaving()], [true, true]);
    // The pane goes, and comes back before the save has answered.
    unmount();
    await settle();
    assert.equal(W.__businessTabSave.zone.pending(), true, "the save is the tab's, not the page's");
    tree = W.React.createElement(W.BusinessTab, { flash });
    openFold(tree, "timezone");
    tree = redrawTab(flash);
    const box = () => find(inline(tree, "timezone"), (n) => n.props?.role === "combobox");
    assert.deepEqual(
      [inline(tree, "timezone").props["aria-busy"], W.__settingsSaving(), box().props.readOnly],
      [true, true, true],
      "REGRESSION: the reopened editor was not busy",
    );
    assert.equal(byTestId(tree, "rec-inline-save-timezone").props["aria-label"], "Saving…");
    // Nothing can be picked under it, so nothing is there for its answer to throw away.
    box().props.onChange({ target: { value: "denver" } });
    tree = redrawTab(flash);
    assert.equal(all(inline(tree, "timezone"), (n) => n.props?.role === "option").length, 0);
    saveRow(tree, "timezone");
    assert.deepEqual(asked, ["America/Chicago"], "and a second press sends nothing more");
    // The door itself sends one zone at a time, whoever asks it: it is the tab's, not the row's.
    W.__businessTabSave.zone.save({ tz: "America/Denver", done: () => {}, flash });
    assert.deepEqual(asked, ["America/Chicago"]);
    answer();
    await settle();
    tree = redrawTab(flash);
    assert.deepEqual([openRows(tree), W.__settingsSaving()], [[], false]);
    assert.equal(textOf({ props: { children: flashes.at(-1).msg } }), "Your day is measured in Chicago now.");
  } finally {
    delete W.__workspace;
  }
});

test("after the calendar's address is saved, nothing is said of a read until the read after the save lands", () => {
  // The old calendar's read showed briefly under the new address: "12 events" of a calendar no longer connected. The
  // saver says when it took the fold's save, and a read fetched before that moment is the old calendar's; the save
  // reads the calendar again (refresh-map.ts), and what that finds is stated when it lands.
  const sent = saving();
  const asked = [];
  W.__calendar = {
    refresh: () => {
      asked.push("refresh");
      return new Promise(() => {});
    },
  };
  try {
    W.__CALENDAR = calendarRead(readOk());
    let tree = drawTab();
    assert.match(
      textOf(byTestId(tree, "rec-calendar-read")),
      /read 4m ago/,
      "the old calendar's read, fresh, under the old address",
    );
    openFold(tree, "calendar");
    tree = redrawTab();
    find(foldOf(tree, "calendar"), (n) => classes(n).includes("rec-input")).props.onChange({
      target: { value: "https://calendar.google.com/calendar/ical/new/private-xyz/basic.ics" },
    });
    tree = redrawTab();
    saveFoldOf(tree, "calendar");
    assert.equal(sent.length, 1);
    // The settings re-read lands with the new address (the stand-in PUT never re-reads; this is what the app's does).
    W.__SETTINGS = { ...W.__SETTINGS, config: sent[0].config, version: 8 };
    tree = redrawTab();
    assert.match(textOf(byTestId(tree, "rec-row-calendar")), /calendar\.google\.com/, "the new address is stated");
    assert.deepEqual(
      [byTestId(tree, "rec-calendar-read"), byTestId(tree, "rec-calendar-unread")],
      [null, null],
      "REGRESSION: the old calendar's 12 events under it",
    );
    assert.equal(asked.length, 0, "and nothing is asked for it here: the save's own re-read is on its way");
    // The read after the save lands: stated.
    W.__CALENDAR = { ...calendarRead(readOk({ events: 3 })), fetchedAt: Date.now() + 1 };
    W.dispatchEvent({ type: "surface:calendar" });
    tree = redrawTab();
    assert.equal(textOf(byTestId(tree, "rec-calendar-read")), W.__CALENDAR.vm.feed.read);
  } finally {
    delete W.__CALENDAR;
    delete W.__calendar;
  }
});

test("a re-read after the calendar's address is saved that fails says so, with its Retry, and never leaves the row blank", () => {
  // Task 3.3's re-review. The row says nothing of a read from before the save, and asked that before whether the read
  // had failed, so a re-read that FAILED left the row blank for good: the read in the window stays the old calendar's.
  const sent = saving();
  const asked = [];
  const was = W.__surfaceFailed;
  W.__calendar = {
    refresh: () => {
      asked.push("refresh");
      return new Promise(() => {});
    },
  };
  try {
    W.__CALENDAR = calendarRead(readOk());
    let tree = drawTab();
    openFold(tree, "calendar");
    tree = redrawTab();
    find(foldOf(tree, "calendar"), (n) => classes(n).includes("rec-input")).props.onChange({
      target: { value: "https://calendar.google.com/calendar/ical/new/private-xyz/basic.ics" },
    });
    tree = redrawTab();
    saveFoldOf(tree, "calendar");
    W.__SETTINGS = { ...W.__SETTINGS, config: sent[0].config, version: 8 };
    tree = redrawTab();
    assert.deepEqual(
      [byTestId(tree, "rec-calendar-read"), byTestId(tree, "rec-calendar-unread")],
      [null, null],
      "while the save's re-read is on its way, nothing",
    );
    // The save's own re-read fails: the runner marks the surface failed, and the old calendar's read stays in the window.
    W.__surfaceFailed = (key) => key === "calendar";
    tree = redrawTab();
    assert.match(
      textOf(byTestId(tree, "rec-calendar-unread")),
      /Couldn't read what its last read found/,
      "REGRESSION: the row was blank for good",
    );
    assert.equal(
      byTestId(tree, "rec-calendar-read"),
      null,
      "and the old calendar's read is still not stated as this one's",
    );
    assert.equal(asked.length, 0);
    press(byTestId(tree, "rec-calendar-unread-retry"));
    assert.equal(asked.length, 1, "its Retry asks again");
  } finally {
    delete W.__CALENDAR;
    delete W.__calendar;
    if (was) W.__surfaceFailed = was;
    else delete W.__surfaceFailed;
  }
});

test("a closed day taken out goes back between the same two days, whatever was taken out after it: every list's rows() keeps it", () => {
  // The spec review's probe, on the fold's list rather than the sheet's: the rule is rows()', not the sheet's. Each Undo
  // kept the index its row had when it went, so with the third day out and then the first, the third went back last.
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const days = ["2099-01-05", "2099-02-05", "2099-03-05", "2099-04-05"].map((date) => ({ date }));
  let tree = drawTab({ flash, profile: { ...melany, closures: days } });
  openFold(tree, "closures");
  tree = redrawTab(flash);
  const dates = () =>
    all(foldOf(tree, "closures"), (n) => n.type === "input" && /^Closed from, /.test(n.props["aria-label"] || "")).map(
      (n) => n.props.value,
    );
  press(byTestId(tree, "rec-closure-remove-2"));
  tree = redrawTab(flash);
  const march = flashes.at(-1).undo;
  press(byTestId(tree, "rec-closure-remove-0"));
  tree = redrawTab(flash);
  const january = flashes.at(-1).undo;
  march();
  tree = redrawTab(flash);
  assert.deepEqual(dates(), ["2099-02-05", "2099-03-05", "2099-04-05"], "REGRESSION: March went back after April");
  january();
  tree = redrawTab(flash);
  assert.deepEqual(
    dates(),
    days.map((d) => d.date),
  );
});

test("a shift taken out of one day goes back into that day, whatever another day's shifts did since", () => {
  // The quality review's P1. The put-backs of a day's shifts are that day's list, not the week's: a removal on Monday
  // moved Tuesday's waiting shift up a place, and Tuesday's Undo put its third shift back second.
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const three = [
    { open: "08:00", close: "10:00" },
    { open: "11:00", close: "13:00" },
    { open: "14:00", close: "16:00" },
  ];
  let tree = drawTab({
    flash,
    profile: { ...melany, hours: { ...melany.hours, mon: { intervals: three }, tue: { intervals: three } } },
  });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  const opens = (d) =>
    all(dayOf(tree, d), (n) => n.type === "input" && / opens(,|$)/.test(n.props["aria-label"] || "")).map(
      (n) => n.props.value,
    );
  press(byTestId(tree, "rec-hours-remove-tue-2"));
  tree = redrawTab(flash);
  const tuesday = flashes.at(-1).undo;
  press(byTestId(tree, "rec-hours-remove-mon-1"));
  tree = redrawTab(flash);
  const monday = flashes.at(-1).undo;
  tuesday();
  tree = redrawTab(flash);
  assert.deepEqual(opens("tue"), ["08:00", "11:00", "14:00"], "REGRESSION: Tuesday's third shift went back second");
  monday();
  tree = redrawTab(flash);
  assert.deepEqual(opens("mon"), ["08:00", "11:00", "14:00"]);
});

test("a day's hours replaced whole by a copy leave its waiting shift nowhere to go, and its Undo says so", () => {
  // The quality review's P3. Copying Monday onto Tuesday replaced Tuesday's shifts from outside the list's own rows(),
  // and the Undo of a shift taken out of Tuesday before the copy then put it into the copied hours.
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const three = [
    { open: "08:00", close: "10:00" },
    { open: "11:00", close: "13:00" },
    { open: "14:00", close: "16:00" },
  ];
  let tree = drawTab({
    flash,
    profile: {
      ...melany,
      hours: { ...melany.hours, mon: { open: "09:00", close: "17:00" }, tue: { intervals: three } },
    },
  });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  const opens = (d) =>
    all(dayOf(tree, d), (n) => n.type === "input" && / opens(,|$)/.test(n.props["aria-label"] || "")).map(
      (n) => n.props.value,
    );
  press(byTestId(tree, "rec-hours-remove-tue-1"));
  tree = redrawTab(flash);
  const tuesday = flashes.at(-1).undo;
  tree = copyTo(tree, flash, "Tuesday");
  assert.deepEqual(opens("tue"), ["09:00"], "Tuesday holds Monday's hours");
  tuesday();
  tree = redrawTab(flash);
  assert.deepEqual(opens("tue"), ["09:00"], "REGRESSION: the old shift went back into the copied hours");
  assert.deepEqual(
    [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
    ["warn", "Not put back — the list it came from was replaced since, so it has no place to go."],
  );
  // A shift taken out after the copy goes back as any does.
  press(byTestId(tree, "rec-hours-add-tue"));
  tree = redrawTab(flash);
  typeAt(tree, "Tuesday opens, second shift", "18:00");
  tree = redrawTab(flash);
  typeAt(tree, "Tuesday closes, second shift", "19:00");
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-hours-remove-tue-1"));
  tree = redrawTab(flash);
  flashes.at(-1).undo();
  tree = redrawTab(flash);
  assert.deepEqual(opens("tue"), ["09:00", "18:00"]);
});

test("the page draws itself again when the settings surface is read again: the card's week and the closures follow a zone saved and read back", () => {
  // PaneWorkspace redrew the old card on surface:settings, and the page must hear it too, not only its parent: a zone
  // saved through its own route re-reads settings (refresh-map.ts), and until the page heard that read the card said
  // the old zone's "in … time" and counted the closed days on the old zone's day. Honolulu and Kiritimati are a whole
  // day apart, so a closure on Honolulu's today is ahead there and already past in Kiritimati.
  const today = zoneDayKey(Date.now(), "Pacific/Honolulu");
  const profile = { ...melany, closures: [{ date: today, note: "Stocktake" }] };
  let tree = drawTab({ profile, zone: "Pacific/Honolulu" });
  const sub = (t) => textOf(find(byTestId(t, "rec-card-open"), (n) => classes(n).includes("rec-card-sub")));
  const closed = (t) => textOf(find(byTestId(t, "rec-row-closures"), (n) => classes(n).includes("rec-row-val")));
  assert.equal(sub(tree), openWeekWords(profile.hours, "Pacific/Honolulu"));
  assert.match(
    closed(tree),
    new RegExp(`^${escape(closuresAheadWords(profile.closures, "Pacific/Honolulu", new Date()).line)}`),
  );
  tree = redrawTab();
  // The zone is saved and the settings surface read back: the workspace's list and the read's own preview name the new zone.
  W.__WORKSPACES = [{ id: "t-melany", name: "Melany's Beauty Salon", timezone: "Pacific/Kiritimati" }];
  W.__SETTINGS = settings(profile, {}, {}, "Pacific/Kiritimati");
  quiet();
  W.dispatchEvent({ type: "surface:settings" });
  assert.equal(redrawWanted(), true, "REGRESSION: nothing on the page heard the read, so nothing drew it again");
  tree = redrawTab();
  assert.equal(sub(tree), openWeekWords(profile.hours, "Pacific/Kiritimati"), "the week in the new zone's time");
  assert.notEqual(sub(tree), openWeekWords(profile.hours, "Pacific/Honolulu"));
  assert.equal(
    closuresAheadWords(profile.closures, "Pacific/Kiritimati", new Date()).count,
    0,
    "the fixture: past, on Kiritimati's day",
  );
  assert.match(closed(tree), /^None ahead/, "and the closed day counted on the business's day");
  // Once the page has gone, the read draws nothing of it.
  unmount();
  quiet();
  W.dispatchEvent({ type: "surface:settings" });
  assert.equal(redrawWanted(), false, "the page lets go of the event as it goes");
});
