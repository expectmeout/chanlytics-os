/**
 * The Booking tool's sheet on the page a door was pressed on (surfaces/settings/booking-tool/): the Business tab's own
 * fold, drawn with no row under it, over the tab's one saver. The page, the record and the presses are
 * _business-tab-harness.mjs; every claim is something the sheet drew or something a press sent.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { again, unmount, find, byTestId, classes, press, settle } from "../../_legacy-react.mjs";
import {
  W,
  drawTab,
  foldOf,
  saveFoldOf,
  cancelFoldOf,
  saving,
  written,
  without,
} from "../../_business-tab-harness.mjs";

const BT = "../../../../../apps/dashboard/src/surfaces/settings/booking-tool";
const { BookingToolSheet } = await import(`${BT}/sheet.tsx`);
const verbs = await import("../../../../../apps/dashboard/src/surfaces/legacy-verbs.ts");

after(() => unmount());

const went = [];
W.CHANLY.nav = (to) => went.push(to);

/** The sheet over a record, as the host draws it once a door has asked: the tab's page gone first, as on another page. */
const drawSheet = (record, closed) => {
  drawTab(record);
  unmount();
  // The Calendar's read is here, as on the Calendar and Today: nothing to wait for.
  W.__CALENDAR = { vm: null };
  W.__recordFolds.reset();
  const draw = () => W.React.createElement(BookingToolSheet, { onClosed: closed, flash: () => {} });
  draw();
  return () => again(draw);
};
const sheetOf = (tree) => find(tree, (n) => classes(n).includes("rec-fold-sheet"));

test("a door's sheet is the Booking tool's fold alone: open, no row under it, and its Save is the tab's own save", () => {
  const sent = saving();
  let closed = 0;
  const redraw = drawSheet(
    { config: { calendar: undefined }, brain: { booking_link: "https://booksy.com/en-us/1_x" } },
    () => {
      closed += 1;
    },
  );
  let tree = redraw();
  assert.equal(W.__recordFolds.open(), "calendar", "opened as the row's own act opens it");
  assert.ok(sheetOf(tree), "drawn as a sheet");
  assert.equal(byTestId(tree, "rec-row-calendar"), null, "and no row at rest: this page states none");
  const stored = written(W.__SETTINGS.config);
  press(find(byTestId(foldOf(tree, "calendar") ?? tree, "bto-bookings-guess"), (n) => n.type === "button"));
  tree = redraw();
  saveFoldOf(tree, "calendar");
  assert.deepEqual(sent[0].config, { ...without(stored, "calendar"), bookings: { tool: "booksy" } });
  assert.equal(closed, 1, "taken, the fold closes and the host is told once");
  assert.equal(W.__recordFolds.open(), null);
});

test("Cancel closes it and tells the host; nothing is sent", () => {
  const sent = saving();
  let closed = 0;
  const redraw = drawSheet({ config: { calendar: undefined } }, () => {
    closed += 1;
  });
  cancelFoldOf(redraw(), "calendar");
  assert.equal(closed, 1);
  assert.equal(sent.length, 0);
});

test("a workspace with no receptionist has no row to edit: the door goes to Settings, which says so", () => {
  let closed = 0;
  went.length = 0;
  drawTab();
  unmount();
  W.__recordFolds.reset();
  W.__SETTINGS = { ...W.__SETTINGS, config: {} };
  W.__CALENDAR = { vm: null };
  W.React.createElement(BookingToolSheet, { onClosed: () => (closed += 1), flash: () => {} });
  assert.deepEqual(went, ["admin/workspace/calendar"]);
  assert.equal(closed, 1);
  assert.equal(W.__recordFolds.open(), null, "and nothing was opened");
});

test("a door asks the frame's host; with none drawn, or for a role that may not change the business, it is Settings' row", () => {
  const ROW = "admin/workspace/calendar";
  went.length = 0;
  verbs.openBookingTool(ROW);
  assert.deepEqual(went, [ROW], "no host: the route");
  let asked = 0;
  const gone = verbs.hostBookingTool(() => (asked += 1));
  const may = W.canDo;
  W.canDo = () => false;
  verbs.openBookingTool(ROW);
  assert.equal(went.length, 2, "a role that only reads: the route, where the row is read");
  W.canDo = may;
  verbs.openBookingTool(ROW);
  assert.equal(went.length, 2, "a host and a role that may: nowhere");
  assert.equal(asked, 1, "the sheet is asked for here");
  gone();
  verbs.openBookingTool(ROW);
  assert.equal(went.length, 3, "the host gone, the route again");
});

test("on a page that has not read Settings or the Calendar, each is asked for once and the sheet opens when they answer", async () => {
  drawTab({ config: { calendar: undefined } });
  unmount();
  W.__recordFolds.reset();
  const record = W.__SETTINGS;
  W.__SETTINGS = undefined;
  W.__CALENDAR = undefined;
  const asked = [];
  W.__refreshSurface = (key) => {
    asked.push(key);
    if (key === "settings") W.__SETTINGS = record;
    else W.__CALENDAR = { vm: null };
    return Promise.resolve();
  };
  const draw = () => W.React.createElement(BookingToolSheet, { onClosed: () => {}, flash: () => {} });
  assert.equal(sheetOf(draw()), null, "nothing drawn before the reads");
  assert.deepEqual(asked, ["settings", "calendar"]);
  await settle();
  assert.ok(sheetOf(again(draw)) || sheetOf(again(draw)), "read, it opens");
  assert.equal(W.__recordFolds.open(), "calendar");
  assert.deepEqual(asked, ["settings", "calendar"], "asked once");
  delete W.__refreshSurface;
});
