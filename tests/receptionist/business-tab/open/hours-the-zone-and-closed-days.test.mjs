/**
 * When you're open: the hours fold as the week on one scale, a closed day, copying a day, the zone, and the days the
 * week does not apply to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  businessGap,
  hasProfile,
  openWeekWords,
  closuresAheadWords,
  zoneDayKey,
  hoursZoneWords,
  timezoneWords,
  knownTimezones,
  MAX_INTERVALS_PER_DAY,
  MAX_CLOSURES,
} from "@chanlytics/contracts";
import { PROFILE_CROSSING_WORDS } from "../../../../apps/dashboard/src/surfaces/settings/business/model/fold-limits.ts";
import { settle, all, find, byTestId, textOf, classes, press } from "../../../_stub-react.mjs";
import {
  cancelFoldOf,
  cancelRow,
  composed,
  dayOf,
  drawTab,
  escape,
  foldOf,
  inline,
  KNOWN,
  labelled,
  marisa,
  openFold,
  openFolds,
  openRows,
  partsOf,
  problemUnder,
  redrawTab,
  saveFoldOf,
  saveRow,
  saving,
  settingsHeld,
  typeAt,
  W,
  without,
  written,
} from "../../../_business-tab-harness.mjs";
import { NEW_YEAR, XMAS, copyTo, place, summaryOf } from "./_open.mjs";
import { bridgeHolds, whoIsLooking, provided } from "../../../shell/_bridge-holds.mjs";

test("When you're open draws three rows in the spec's order, under a line contracts wrote", () => {
  const tree = drawTab();
  const card = byTestId(tree, "rec-card-open");
  assert.deepEqual(all(card, (n) => classes(n).includes("rec-row-key")).map(textOf), [
    "Hours",
    "Timezone",
    "Days you're closed",
  ]);
  // What the business books with: its calendar link and its tool's booking emails, one row (7 Oct 2026; it was
  // "Calendar it reads" and "Where your bookings come from", each sending the owner to the other), first on Booking,
  // the card beside this one on Hours & booking (17 Oct 2026).
  assert.equal(
    textOf(find(byTestId(tree, "rec-card-booking"), (n) => classes(n).includes("rec-row-key"))),
    "Booking tool",
  );
  assert.equal(textOf(find(card, (n) => classes(n).includes("rec-card-title"))), "When you're open");
  assert.equal(
    textOf(find(card, (n) => classes(n).includes("rec-card-sub"))),
    openWeekWords(marisa.hours, "America/New_York"),
  );
  assert.equal(
    openWeekWords(marisa.hours, "America/New_York"),
    "Six days a week, in New York time",
    "the canvas's line, from contracts",
  );
  // The first card of Hours & booking, before Booking, as the record's three pages draw it in turn.
  assert.deepEqual(
    all(drawTab(), (n) => classes(n).includes("rec-card")).map((n) => n.props["data-testid"]),
    [
      "rec-card-who",
      "rec-card-offer",
      "rec-card-goal",
      "rec-card-open",
      "rec-card-booking",
      "rec-card-answers",
      "rec-card-calls",
      "rec-card-knows",
      "rec-card-can",
      "rec-card-told",
      "rec-card-try",
    ],
  );
});

test("the summary sentence is the one the composer wrote", () => {
  const row = byTestId(drawTab({ profile: marisa }), "rec-row-hours");
  assert.match(textOf(row), new RegExp(escape(summaryOf(marisa.hours))));
  assert.equal(
    textOf(byTestId(row, "rec-hours-line")),
    summaryOf(marisa.hours),
    "word for word, joined as hoursSummary joins them",
  );
});

test("with no hours stored, the row is empty in the old card's words, and its act adds them", () => {
  const tree = drawTab({ profile: without(marisa, "hours") });
  const row = byTestId(tree, "rec-row-hours");
  assert.equal(row.props["data-empty"], "true");
  assert.match(textOf(row), /Not set · AI cannot state your hours/);
  const act = byTestId(tree, "rec-row-act-hours");
  assert.equal(textOf(act), "Add them");
  assert.ok(act.props["aria-label"].startsWith("Add them"), "a person who says the words on it reaches it");
  assert.equal(
    textOf(find(byTestId(tree, "rec-card-open"), (n) => classes(n).includes("rec-card-sub"))),
    "Times are in New York time",
  );
});

test("the hours fold is the week on one scale: a switch, the bars and the times for each day, in the zone AI states them in", () => {
  let tree = drawTab();
  assert.deepEqual(openFolds(tree), []);
  assert.equal(foldOf(tree, "hours"), null, "its sheet shut until it is asked for");
  openFold(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["hours"]);
  // A sheet beside the page (RecordFold frame="sheet", at a desktop's width too): the row stays in its card behind
  // it, never inside it.
  const fold = foldOf(tree, "hours");
  assert.equal(fold.props.role, "dialog", "a sheet, not a fold under the row");
  assert.equal(byTestId(fold, "rec-row-hours"), null, "the row is not inside the sheet");
  assert.ok(byTestId(tree, "rec-row-hours"), "and still in its card behind it");
  // The zone by the name the card above it already uses (openWeekWords: "in New York time"), never the IANA id: an
  // owner setting their opening hours has no use for "America/New_York", and it is the machine's name for the place.
  assert.equal(textOf(find(fold, (n) => classes(n).includes("rec-sheet-sub"))), hoursZoneWords("America/New_York"));
  assert.equal(hoursZoneWords("America/New_York"), "In New York time");
  assert.equal(textOf(byTestId(tree, "rec-fold-save-hours")), "Save", "every sheet's Save says Save");
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
      labelled(fold, "Monday opens").props["aria-haspopup"],
    ],
    ["09:30", "18:00", "menu"],
  );
  assert.deepEqual(
    ["mon", "sun"].map((d) => dayOf(tree, d).props["data-open"]),
    ["true", "false"],
    "each day says whether it is open",
  );
  assert.match(textOf(dayOf(tree, "sun")), /Closed/);
  assert.equal(labelled(fold, "Sunday opens"), null, "a closed day offers no boxes");
  // The zone is the one the settings read resolved the prompt in.
  tree = drawTab({ zone: "America/Chicago" });
  openFold(tree, "hours");
  tree = redrawTab();
  assert.equal(
    // Opened afresh: the sheet's line under its title says the zone.
    textOf(find(foldOf(tree, "hours"), (n) => classes(n).includes("rec-sheet-sub"))),
    hoursZoneWords("America/Chicago"),
  );
  assert.equal(hoursZoneWords("America/Chicago"), "In Chicago time");
});

test("an hours save sends the stored config with the week changed, and everything else as it was", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = written(settingsHeld().config);
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
      profile: { ...stored.brain.profile, hours: { ...marisa.hours, mon: { open: "09:30", close: "17:00" } } },
    },
  });
  assert.equal(textOf(flashes.at(-1).msg), "Saved · AI picks it up within a minute");
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
  assert.match(textOf(byTestId(tree, "rec-fold-hours-cancel-confirm")), /Discard changes\?/);
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
  const stored = written(settingsHeld().config);
  openFold(tree, "hours");
  tree = redrawTab();
  press(byTestId(tree, "rec-hours-switch-sat"));
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-hours-switch-sat").props["aria-checked"], false);
  assert.match(textOf(dayOf(tree, "sat")), /Closed · times kept/);
  assert.equal(dayOf(tree, "sat").props["data-open"], "false", "shut, and says it");
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
    brain: { ...stored.brain, profile: { ...stored.brain.profile, hours: { ...marisa.hours, sat: {} } } },
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
  assert.equal(byTestId(tree, "rec-fold-says-hours"), null, "a draft the page refuses is never told to AI");
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
    all(
      dayOf(tree, "mon"),
      (n) => n.props?.["aria-haspopup"] === "menu" && / opens(,|:|$)/.test(n.props["aria-label"] || ""),
    ).map((n) => n.props.value);
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
  // One in the week: the voice's starting points are a menu of their own, in their own fold (23 Sep).
  assert.equal(
    // The times are menus too (each a time's, open-week.tsx BtoTime), told apart by the value each holds.
    all(
      byTestId(tree, "rec-fold-hours"),
      (n) => n.type === "button" && n.props["aria-haspopup"] === "menu" && !("value" in n.props),
    ).length,
    1,
  );
  tree = copyTo(tree, flash, "Every day");

  const said = flashes.at(-1);
  assert.match(textOf({ props: { children: said.msg } }), /Sun/, "the day that was closed is named");
  assert.match(textOf({ props: { children: said.msg } }), /Fri|Sat/, "and the days whose own hours went");
  assert.equal(
    textOf({ props: { children: said.msg } }),
    "Copied Mon's hours — Sun was closed and is now open, and replaced different hours on Fri, Sat",
  );
  assert.equal(typeof said.undo, "function", "the whole grid goes back in one press");
  assert.equal(dayOf(tree, "sun").props["data-open"], "true", "Sunday is open, as Monday is");
  assert.deepEqual(
    [labelled(tree, "Sunday closes").props.value, labelled(tree, "Friday closes").props.value],
    ["18:00", "18:00"],
  );

  said.undo();
  tree = redrawTab(flash);
  assert.equal(dayOf(tree, "sun").props["data-open"], "false", "Sunday is shut again");
  assert.equal(byTestId(tree, "rec-hours-switch-sun").props["aria-checked"], false);
  assert.equal(labelled(tree, "Friday closes").props.value, "19:00", "and Friday has its own hours back");

  // To the weekdays, as the old link copied; and to one day by its name. Nothing surprising, nothing named.
  tree = copyTo(tree, flash, "Weekdays");
  assert.equal(
    textOf({ props: { children: flashes.at(-1).msg } }),
    "Copied Mon's hours — replaced different hours on Fri",
  );
  assert.equal(labelled(tree, "Saturday closes").props.value, "19:00", "Saturday is no weekday");
  copyTo(tree, flash, "Tuesday");
  assert.equal(textOf({ props: { children: flashes.at(-1).msg } }), "Copied Mon's hours · nothing else changed");

  // A business shut on Mondays copies the first day it is open.
  tree = drawTab({ flash, profile: { ...marisa, hours: { ...marisa.hours, mon: {} } } });
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
  redrawTab(flash);
  copied.undo();
  tree = redrawTab(flash);
  assert.deepEqual([openFolds(tree), W.__settingsUnsaved()], [[], false]);
  assert.deepEqual(
    [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
    ["warn", "Not put back · the editor it was in has closed. Open it again to change it."],
  );
  // And one pressed while the fold's save is out: nothing is typed into a save on its way, and that is said too.
  bridgeHolds({ parts: { saveSettings: () => new Promise(() => {}) } });
  tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  tree = copyTo(tree, flash, "Every day");
  const undoCopy = flashes.at(-1).undo;
  saveFoldOf(tree, "hours");
  redrawTab(flash);
  undoCopy();
  tree = redrawTab(flash);
  assert.equal(
    byTestId(tree, "rec-hours-switch-sun").props["aria-checked"],
    true,
    "Sunday is still open: nothing was put back under the save",
  );
  assert.deepEqual(
    [flashes.at(-1).tone, textOf({ props: { children: flashes.at(-1).msg } })],
    ["warn", "Not put back · this is being saved."],
  );
});

test("the hours fold says what AI will be told as the draft stands, what goes, and when a week is the last thing a record composes from", () => {
  let tree = drawTab();
  const stored = settingsHeld().config.brain;
  openFold(tree, "hours");
  tree = redrawTab();
  let says = byTestId(tree, "rec-fold-says-hours");
  assert.deepEqual(
    partsOf(says),
    [["Preview what it's told", composed("hours", stored).join("\n")]],
    "unchanged: the block as it stands, under the canvas's eyebrow",
  );
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  says = byTestId(tree, "rec-fold-says-hours");
  const next = {
    ...stored,
    profile: { ...marisa, hours: { ...marisa.hours, mon: { open: "09:30", close: "17:00" } } },
  };
  // The hours block's lines are runs of days: a changed Monday re-cuts them, and the lines that fall out of the old
  // block are about days nobody changed. So nothing is said to go while the block stays (the folds test holds the
  // rule); the whole new block says what Monday becomes.
  assert.deepEqual(partsOf(says), [["Preview what it's told", composed("hours", next).join("\n")]]);
  assert.match(textOf(says), /17:00/, "it follows the draft");

  // Every day closed, on a record that still composes: the block goes whole, line by line.
  for (const d of ["mon", "tue", "wed", "thu", "fri", "sat"]) {
    press(byTestId(tree, `rec-hours-switch-${d}`));
    tree = redrawTab();
  }
  assert.deepEqual(partsOf(byTestId(tree, "rec-fold-says-hours")), [
    ["No longer told", composed("hours", stored).join("\n")],
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

test("the gap line's hours door opens the fold, and the fold asks before its changes go like any other", () => {
  let tree = drawTab({ profile: without(marisa, "hours") });
  const gap = businessGap(settingsHeld().config.brain, null);
  assert.equal(gap.row, "hours");
  const door = byTestId(byTestId(tree, "rec-gap"), "rec-gap-door");
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
  assert.match(textOf(byTestId(tree, "rec-fold-hours-ask-confirm")), /Discard changes\?/);
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
    [
      labelled(tree, "Monday closes").props["aria-disabled"],
      byTestId(tree, "rec-hours-switch-mon").props["aria-disabled"],
    ],
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
  press(byTestId(tree, "rec-fold-hours-close"));
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
  bridgeHolds({
    parts: {
      workspace: {
        setTimezone: async (tz) => {
          asked.push(tz);
          bridgeHolds({ who: { workspaces: whoIsLooking().workspaces.map((t) => ({ ...t, timezone: tz })) } });
          return { ok: true, tz, message: "" };
        },
      },
    },
  });
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
      "Days now run on Chicago time.",
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
    provided("workspace").setTimezone = async () => ({
      ok: false,
      tz: "",
      message: "Only the owner can change the timezone.",
    });
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
    // Cancel with a change closes it at once: a row holds one value, and its own Cancel asks nothing.
    cancelRow(tree, "timezone");
    tree = redrawTab(flash);
    assert.equal(byTestId(tree, "rec-inline-timezone-cancel-confirm"), null);
    assert.deepEqual(openRows(tree), []);
  } finally {
    bridgeHolds({ parts: { workspace: undefined } });
  }
});

test("the closed days ahead are counted on the business's own day, and none ahead says so with its act", () => {
  // At any instant it is a later date on Kiritimati (UTC+14) than on Pago Pago (UTC-11). A closure on Pago Pago's today
  // is still ahead there, and already past on Kiritimati, whatever zone this machine is in.
  const now = Date.now();
  const earlier = zoneDayKey(now, "Pacific/Pago_Pago");
  assert.ok(zoneDayKey(now, "Pacific/Kiritimati") > earlier);
  const profile = { ...marisa, closures: [{ date: earlier, note: "Stocktake" }] };
  let row = byTestId(drawTab({ profile, zone: "Pacific/Pago_Pago" }), "rec-row-closures");
  assert.equal(
    textOf(find(row, (n) => classes(n).includes("rec-row-value"))),
    closuresAheadWords(profile.closures, "Pacific/Pago_Pago", new Date(now)).line,
  );
  assert.match(textOf(row), /^Days you're closed1 ahead · /);
  row = byTestId(drawTab({ profile, zone: "Pacific/Kiritimati" }), "rec-row-closures");
  assert.equal(row.props["data-empty"], "true", "the same closure, already past where the business is");
  assert.match(textOf(row), /None ahead/);

  // Marisa keeps none: the canvas's empty row.
  const tree = drawTab();
  assert.match(textOf(byTestId(tree, "rec-row-closures")), /None ahead/);
  assert.equal(textOf(byTestId(tree, "rec-row-act-closures")), "Add one");
  // Two ahead, the next one named as the Calendar's own list names it.
  assert.match(
    textOf(byTestId(drawTab({ profile: { ...marisa, closures: [NEW_YEAR, XMAS] } }), "rec-row-closures")),
    /2 ahead · next Dec 24 – 26 · Christmas/,
  );
});

test("the closures fold adds, edits and removes a closed day, puts a removed one back where it was, and saves only the closures", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash, profile: { ...marisa, closures: [XMAS, NEW_YEAR] } });
  const stored = written(settingsHeld().config);
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
  // The one case this cannot express is the tip beside Add, never a paragraph under the list (Ruben, 10 Oct 2026).
  assert.match(
    byTestId(tree, "rec-closures-tip").props["data-tip"],
    /^Closing early\? Set that day's hours instead/,
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
  assert.equal(textOf(flashes.at(-1).msg), "Saved · AI picks it up within a minute");
});

test("what stops a closures save is said under its own box, and at the cap the fold says so and offers no more", () => {
  const sent = saving();
  let tree = drawTab({ profile: { ...marisa, closures: [XMAS] } });
  openFold(tree, "closures");
  tree = redrawTab();
  const boxes = () => all(byTestId(tree, "rec-closure-0"), (n) => n.type === "input");
  boxes()[2].props.onChange({ target: { value: "x".repeat(201) } });
  tree = redrawTab();
  saveFoldOf(tree, "closures");
  tree = redrawTab();
  assert.match(textOf(problemUnder(tree, "rec-closure-0-note")), /At most 200 characters · this is 201\./);
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
  tree = drawTab({ profile: { ...marisa, closures: many } });
  openFold(tree, "closures");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-closures-add"), null);
  assert.equal(
    textOf(byTestId(tree, "rec-closures-cap")),
    `That is the most closures AI keeps (${MAX_CLOSURES}). Dates that have passed can go.`,
  );
  press(byTestId(tree, "rec-closure-remove-0"));
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-closures-add"), "one fewer, and one may be added again");
});
