/**
 * When you're open while it saves and reads again: a refusal said once, presses under Saving…, Cancel asking first, a
 * stale read and its Retry, and an Undo that puts back what it took where it was.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openWeekWords,
  closuresAheadWords,
  zoneDayKey,
  MAX_INTERVALS_PER_DAY,
  MAX_CLOSURES,
} from "@chanlytics/contracts";
import {
  unmount,
  settle,
  all,
  find,
  byTestId,
  textOf,
  classes,
  press,
  quiet,
  redrawWanted,
} from "../../../_stub-react.mjs";
import {
  cancelFoldOf,
  dayOf,
  drawTab,
  escape,
  foldOf,
  inline,
  landSettings,
  marisa,
  openFold,
  openFolds,
  openRows,
  redrawTab,
  saveFoldOf,
  saveRow,
  saving,
  settings,
  settingsHeld,
  typeAt,
  W,
} from "../../../_business-tab-harness.mjs";
import { calendarRead, copyTo, place, readOk, setSurfaceValue, surfaceValue } from "./_open.mjs";
import { bridgeHolds, provided } from "../../../shell/_bridge-holds.mjs";

test("a stale read whose refresh failed says so where the read would be, with a Retry, and never goes on stating the old one", async () => {
  // The spec review's probe: FailedRead drew only when there was no surface at all, so a read from half an hour ago
  // whose refresh had failed was stated as if nothing had happened, or not stated and not explained.
  const was = { calendar: provided("calendar"), failed: provided("surfaceFailed") };
  const answers = [];
  bridgeHolds({ parts: { calendar: { refresh: () => new Promise((resolve) => answers.push(resolve)) } } });
  try {
    setSurfaceValue("calendar", calendarRead(readOk(), 30 * 60000));
    let tree = drawTab();
    assert.equal(byTestId(tree, "rec-calendar-read").props["data-reading"], "true", "asked, and on its way");
    answers[0](false);
    await settle();
    tree = redrawTab();
    const row = byTestId(tree, "rec-row-calendar");
    assert.equal(byTestId(row, "rec-calendar-read"), null, "the old read is not stated as if it were the latest");
    assert.match(textOf(byTestId(row, "rec-calendar-unread")), /Couldn't read what it found when it last updated/);
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
    setSurfaceValue("calendar", calendarRead(readOk({ events: 5 })));
    W.dispatchEvent({ type: "surface:calendar" });
    answers[1](true);
    await settle();
    tree = redrawTab();
    assert.equal(textOf(byTestId(tree, "rec-calendar-read")), surfaceValue("calendar").vm.feed.read);
    assert.equal(byTestId(tree, "rec-calendar-unread"), null);
    // A refresh that throws is a refresh that failed.
    bridgeHolds({ parts: { calendar: { refresh: () => Promise.reject(new Error("offline")) } } });
    setSurfaceValue("calendar", calendarRead(readOk(), 30 * 60000));
    tree = drawTab();
    await settle();
    tree = redrawTab();
    assert.ok(byTestId(tree, "rec-calendar-unread"));
    // And the runner's own word for it counts too: the surface is marked failed, with a stale read still in the window.
    bridgeHolds({ parts: { calendar: { refresh: () => new Promise(() => {}) } } });
    bridgeHolds({ parts: { surfaceFailed: (key) => key === "calendar" } });
    setSurfaceValue("calendar", calendarRead(readOk(), 30 * 60000));
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
    setSurfaceValue("calendar", calendarRead(readOk()));
    tree = drawTab();
    assert.deepEqual([byTestId(tree, "rec-calendar-unread"), !!byTestId(tree, "rec-calendar-read")], [null, true]);
  } finally {
    setSurfaceValue("calendar", undefined);
    if (was.calendar) bridgeHolds({ parts: { calendar: was.calendar } });
    else bridgeHolds({ parts: { calendar: undefined } });
    if (was.failed) bridgeHolds({ parts: { surfaceFailed: was.failed } });
    else bridgeHolds({ parts: { surfaceFailed: undefined } });
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
    all(
      dayOf(tree, "mon"),
      (n) => n.props?.["aria-haspopup"] === "menu" && / opens(,|:|$)/.test(n.props["aria-label"] || ""),
    ).map((n) => n.props.value);
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
    ["warn", "Not put back · Monday already has the most shifts a day takes. Remove one first."],
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
  tree = drawTab({ flash, profile: { ...marisa, closures: many } });
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
    all(
      dayOf(tree, "tue"),
      (n) => n.props?.["aria-haspopup"] === "menu" && / opens(,|:|$)/.test(n.props["aria-label"] || ""),
    ).length,
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
  bridgeHolds({
    parts: {
      workspace: {
        setTimezone: (tz) =>
          new Promise((resolve) => {
            asked.push(tz);
            answer = () => resolve({ ok: true, tz, message: "" });
          }),
      },
    },
  });
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
    tree = W.React.createElement(W.BusinessTab, { flash, part: "hours" });
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
    assert.equal(textOf({ props: { children: flashes.at(-1).msg } }), "Days now run on Chicago time.");
  } finally {
    bridgeHolds({ parts: { workspace: undefined } });
  }
});

test("after the calendar's address is saved, nothing is said of a read until the read after the save lands", () => {
  // The old calendar's read showed briefly under the new address: "12 events" of a calendar no longer connected. The
  // saver says when it took the fold's save, and a read fetched before that moment is the old calendar's; the save
  // reads the calendar again (refresh-map.ts), and what that finds is stated when it lands.
  const sent = saving();
  const asked = [];
  bridgeHolds({
    parts: {
      calendar: {
        refresh: () => {
          asked.push("refresh");
          return new Promise(() => {});
        },
      },
    },
  });
  try {
    setSurfaceValue("calendar", calendarRead(readOk()));
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
    landSettings({ ...settingsHeld(), config: sent[0].config, version: 8 });
    tree = redrawTab();
    assert.match(textOf(byTestId(tree, "rec-row-calendar")), /calendar\.google\.com/, "the new address is stated");
    assert.deepEqual(
      [byTestId(tree, "rec-calendar-read"), byTestId(tree, "rec-calendar-unread")],
      [null, null],
      "REGRESSION: the old calendar's 12 events under it",
    );
    assert.equal(asked.length, 0, "and nothing is asked for it here: the save's own re-read is on its way");
    // The read after the save lands: stated.
    setSurfaceValue("calendar", { ...calendarRead(readOk({ events: 3 })), fetchedAt: Date.now() + 1 });
    W.dispatchEvent({ type: "surface:calendar" });
    tree = redrawTab();
    assert.equal(textOf(byTestId(tree, "rec-calendar-read")), surfaceValue("calendar").vm.feed.read);
  } finally {
    setSurfaceValue("calendar", undefined);
    bridgeHolds({ parts: { calendar: undefined } });
  }
});

test("a re-read after the calendar's address is saved that fails says so, with its Retry, and never leaves the row blank", () => {
  // Task 3.3's re-review. The row says nothing of a read from before the save, and asked that before whether the read
  // had failed, so a re-read that FAILED left the row blank for good: the read in the window stays the old calendar's.
  const sent = saving();
  const asked = [];
  const was = provided("surfaceFailed");
  bridgeHolds({
    parts: {
      calendar: {
        refresh: () => {
          asked.push("refresh");
          return new Promise(() => {});
        },
      },
    },
  });
  try {
    setSurfaceValue("calendar", calendarRead(readOk()));
    let tree = drawTab();
    openFold(tree, "calendar");
    tree = redrawTab();
    find(foldOf(tree, "calendar"), (n) => classes(n).includes("rec-input")).props.onChange({
      target: { value: "https://calendar.google.com/calendar/ical/new/private-xyz/basic.ics" },
    });
    tree = redrawTab();
    saveFoldOf(tree, "calendar");
    landSettings({ ...settingsHeld(), config: sent[0].config, version: 8 });
    tree = redrawTab();
    assert.deepEqual(
      [byTestId(tree, "rec-calendar-read"), byTestId(tree, "rec-calendar-unread")],
      [null, null],
      "while the save's re-read is on its way, nothing",
    );
    // The save's own re-read fails: the runner marks the surface failed, and the old calendar's read stays in the window.
    bridgeHolds({ parts: { surfaceFailed: (key) => key === "calendar" } });
    tree = redrawTab();
    assert.match(
      textOf(byTestId(tree, "rec-calendar-unread")),
      /Couldn't read what it found when it last updated/,
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
    setSurfaceValue("calendar", undefined);
    bridgeHolds({ parts: { calendar: undefined } });
    if (was) bridgeHolds({ parts: { surfaceFailed: was } });
    else bridgeHolds({ parts: { surfaceFailed: undefined } });
  }
});

test("a closed day taken out goes back between the same two days, whatever was taken out after it: every list's rows() keeps it", () => {
  // The spec review's probe, on the fold's list rather than the sheet's: the rule is rows()', not the sheet's. Each Undo
  // kept the index its row had when it went, so with the third day out and then the first, the third went back last.
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const days = ["2099-01-05", "2099-02-05", "2099-03-05", "2099-04-05"].map((date) => ({ date }));
  let tree = drawTab({ flash, profile: { ...marisa, closures: days } });
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
    profile: { ...marisa, hours: { ...marisa.hours, mon: { intervals: three }, tue: { intervals: three } } },
  });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  const opens = (d) =>
    all(
      dayOf(tree, d),
      (n) => n.props?.["aria-haspopup"] === "menu" && / opens(,|:|$)/.test(n.props["aria-label"] || ""),
    ).map((n) => n.props.value);
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
      ...marisa,
      hours: { ...marisa.hours, mon: { open: "09:00", close: "17:00" }, tue: { intervals: three } },
    },
  });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  const opens = (d) =>
    all(
      dayOf(tree, d),
      (n) => n.props?.["aria-haspopup"] === "menu" && / opens(,|:|$)/.test(n.props["aria-label"] || ""),
    ).map((n) => n.props.value);
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
    ["warn", "Not put back · the list it came from was replaced since, so it has no place to go."],
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
  const profile = { ...marisa, closures: [{ date: today, note: "Stocktake" }] };
  let tree = drawTab({ profile, zone: "Pacific/Honolulu" });
  const sub = (t) => textOf(find(byTestId(t, "rec-card-open"), (n) => classes(n).includes("rec-card-sub")));
  const closed = (t) => textOf(find(byTestId(t, "rec-row-closures"), (n) => classes(n).includes("rec-row-val")));
  assert.equal(sub(tree), openWeekWords(profile.hours, "Pacific/Honolulu"));
  assert.match(
    closed(tree),
    new RegExp(`^${escape(closuresAheadWords(profile.closures, "Pacific/Honolulu", new Date()).line)}`),
  );
  redrawTab();
  // The zone is saved and the settings surface read back: the workspace's list and the read's own preview name the new zone.
  bridgeHolds({
    who: { workspaces: [{ id: "t-marisa", name: "Marisa's Beauty Salon", timezone: "Pacific/Kiritimati" }] },
  });
  landSettings(settings(profile, {}, {}, "Pacific/Kiritimati"));
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

test("a fold of one value closes on its own Cancel without asking, and still asks when another row is reached for", () => {
  // Ruben, 7 Oct 2026, of "Where your bookings come from": a question over one picked word is in the way. The fold's
  // own Cancel is the person saying they are done with it. Another row's act is not that decision, so the registry is
  // still told of what was typed and still asks (a person who typed and pressed the next thing may believe it was kept).
  let tree = drawTab();
  const type = (value) => {
    find(foldOf(tree, "calendar"), (n) => classes(n).includes("rec-input")).props.onChange({ target: { value } });
    tree = redrawTab();
  };
  openFold(tree, "calendar");
  tree = redrawTab();
  type("https://calendar.example/feed.ics");
  assert.equal(W.__settingsUnsaved(), true, "the rail and the browser are told of it while it stands open");
  cancelFoldOf(tree, "calendar");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-fold-calendar-cancel-confirm"), null, "nothing asked");
  assert.deepEqual(openFolds(tree), [], "closed at once");
  assert.equal(W.__settingsUnsaved(), false);

  openFold(tree, "calendar");
  tree = redrawTab();
  type("https://calendar.example/feed.ics");
  openFold(tree, "website");
  tree = redrawTab();
  assert.match(textOf(byTestId(tree, "rec-fold-calendar-ask-confirm")), /Discard changes\?/);
  press(byTestId(tree, "rec-fold-calendar-ask-no"));
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["calendar"], "keep editing keeps it open");
});
