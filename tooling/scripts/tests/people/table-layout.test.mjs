/**
 * The table's width model (surfaces/people/table/layout.ts): what each column asks of the room, and what the sums give
 * it. The module is pure, so these run it as it is: no React, no DOM. What the page draws from it (a fixed layout under
 * a `<colgroup>`) is looked at in the running app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { resolveColumnWidths, plOrdered, plLayoutChoices, plMoved, plMovedTo, PL_DRAG_MIN_PX, PL_DRAG_MAX_PX } =
  await importSrc("apps/dashboard/src/surfaces/people/table/layout.ts");

/** A table shaped like People's: a box, a column that wants the room, three that hold still, one that shares. */
const COLS = [
  { key: "sel", width: { base: 42 } },
  { key: "name", width: { base: 280, min: 220, max: 600, grow: 3 } },
  { key: "state", width: { base: 132 } },
  { key: "next", width: { base: 140, min: 110, max: 220, grow: 1 } },
  { key: "last", width: { base: 120 } },
];
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test("with no room measured yet every column is where it starts", () => {
  const r = resolveColumnWidths(COLS, {}, null);
  assert.deepEqual(r.widths, [42, 280, 132, 140, 120]);
  assert.equal(r.scrolls, false);
});

test("spare room goes to the columns that ask for a share, by their shares, and the rest hold still", () => {
  const r = resolveColumnWidths(COLS, {}, 1000);
  assert.equal(
    sum(r.widths),
    1000,
    "the table is exactly as wide as its room, so the browser has none to redistribute",
  );
  assert.equal(r.widths[0], 42, "the box holds still");
  assert.equal(r.widths[2], 132, "a column with no share holds still");
  assert.equal(r.widths[4], 120);
  // 286 spare (the columns start at 714), three shares to name and one to next: 214.5 and 71.5 on top of where each starts.
  assert.ok(Math.abs(r.widths[1] - 494.5) <= 1, `name takes three parts of the room: ${r.widths[1]}`);
  assert.ok(Math.abs(r.widths[3] - 211.5) <= 1, `next takes one: ${r.widths[3]}`);
  assert.equal(r.scrolls, false);
});

test("a column is held to its max while another can take the room, and the rest goes by shares once every one is capped", () => {
  const capped = [
    { key: "a", width: { base: 100, max: 150, grow: 1 } },
    { key: "b", width: { base: 100, max: 400, grow: 1 } },
  ];
  const r = resolveColumnWidths(capped, {}, 500);
  assert.equal(r.widths[0], 150, "a stops at its max");
  assert.equal(r.widths[1], 350, "b takes what a could not");
  const both = resolveColumnWidths(
    [
      { key: "a", width: { base: 100, max: 120, grow: 1 } },
      { key: "b", width: { base: 100, max: 120, grow: 1 } },
    ],
    {},
    400,
  );
  assert.equal(sum(both.widths), 400, "with every taker capped the table is still as wide as its room");
});

test("too little room squeezes the columns that share down to their min, then the table scrolls", () => {
  const squeezed = resolveColumnWidths(COLS, {}, 640);
  assert.equal(sum(squeezed.widths), 640);
  assert.ok(squeezed.widths[1] < 280 && squeezed.widths[1] >= 220, "name gives way, not past its min");
  assert.ok(squeezed.widths[3] < 140 && squeezed.widths[3] >= 110, "next gives way, not past its min");
  assert.equal(squeezed.widths[2], 132, "a column with no share is not squeezed");
  const tight = resolveColumnWidths(COLS, {}, 500);
  assert.equal(tight.widths[1], 220);
  assert.equal(tight.widths[3], 110);
  assert.equal(tight.total, 42 + 220 + 132 + 110 + 120);
  assert.equal(tight.scrolls, true, "past every min the table is wider than its room and scrolls inside its box");
});

test("a width the member dragged to is theirs: it neither grows nor shrinks, and the rest share what is left", () => {
  const r = resolveColumnWidths(COLS, { name: 360 }, 1000);
  assert.equal(r.widths[1], 360);
  assert.equal(sum(r.widths), 1000);
  // Name is theirs, so next is the one taker: it takes the 206 spare, past its max once nobody else can (the room is not left over).
  assert.equal(r.widths[3], 346);
  const small = resolveColumnWidths(COLS, { name: 360 }, 500);
  assert.equal(small.widths[1], 360, "not squeezed to make room");
  assert.equal(small.scrolls, true);
});

test("a dragged width is held inside the drag's bounds, and a value that is no width is no choice", () => {
  assert.equal(resolveColumnWidths(COLS, { state: 5 }, null).widths[2], PL_DRAG_MIN_PX);
  assert.equal(resolveColumnWidths(COLS, { state: 99999 }, null).widths[2], PL_DRAG_MAX_PX);
  assert.equal(resolveColumnWidths(COLS, { state: "wide" }, null).widths[2], 132);
  assert.equal(resolveColumnWidths(COLS, { state: NaN }, null).widths[2], 132);
});

test("rounding never leaves the sum a pixel off the room", () => {
  for (const room of [733, 898, 1033, 1378, 2018]) {
    const r = resolveColumnWidths(COLS, {}, room);
    if (!r.scrolls) assert.equal(r.total, room, `${room}px`);
    assert.ok(r.widths.every((w) => Number.isInteger(w)));
  }
});

test("a member's order puts the columns they placed first, Person stays first and the actions last", () => {
  const cols = [
    { key: "name", pinned: true },
    { key: "state" },
    { key: "next" },
    { key: "last" },
    { key: "actions", fixed: true },
  ];
  assert.deepEqual(
    plOrdered(cols, ["last", "state"]).map((c) => c.key),
    ["name", "last", "state", "next", "actions"],
  );
  assert.deepEqual(
    plOrdered(cols, []).map((c) => c.key),
    ["name", "state", "next", "last", "actions"],
    "no choice keeps the page's own order",
  );
  assert.deepEqual(
    plOrdered(cols, ["nope", "next"]).map((c) => c.key),
    ["name", "next", "state", "last", "actions"],
    "a key that is no column is nothing",
  );
});

test("a saved layout is read with care", () => {
  const cols = [{ key: "name", pinned: true }, { key: "state" }, { key: "last" }, { key: "actions", fixed: true }];
  const got = plLayoutChoices(cols, {
    widths: { state: 190.4, name: 300, actions: 90, gone: 120, last: "wide" },
    order: ["last", "last", "state", "name", "gone", 7],
    density: "compact",
  });
  assert.deepEqual(
    got.widths,
    { state: 190, name: 300 },
    "a fixed column and an unknown one have no width of their own",
  );
  assert.deepEqual(got.order, ["last", "state"], "once each, only columns a member may move");
  assert.equal(got.density, "compact");
  assert.deepEqual(plLayoutChoices(cols, {}), { widths: {}, order: [], density: "comfortable" });
  assert.deepEqual(plLayoutChoices(cols, { widths: [1], order: "state", density: "tall" }), {
    widths: {},
    order: [],
    density: "comfortable",
  });
});

test("a column moves one place among the ones a member may move, and no further than the ends", () => {
  const movable = ["state", "next", "last"];
  assert.deepEqual(plMoved([], movable, "last", -1), ["state", "last", "next"]);
  assert.deepEqual(plMoved(["last", "state", "next"], movable, "state", 1), ["last", "next", "state"]);
  assert.deepEqual(plMoved([], movable, "state", -1), [], "the first column cannot go earlier: nothing changes");
  assert.deepEqual(plMoved(["state"], movable, "last", 1), ["state"]);
});

test("a column dragged onto another lands before it from the right and after it from the left, and keeps the rest in order", () => {
  const movable = ["state", "next", "last", "visits"];
  assert.deepEqual(
    plMovedTo([], movable, "last", "state"),
    ["last", "state", "next", "visits"],
    "from the right: before",
  );
  assert.deepEqual(
    plMovedTo([], movable, "state", "last"),
    ["next", "last", "state", "visits"],
    "from the left: after",
  );
  assert.deepEqual(
    plMovedTo(["visits", "state"], movable, "next", "visits"),
    ["next", "visits", "state", "last"],
    "from an order already kept",
  );
  assert.deepEqual(plMovedTo([], movable, "state", "state"), [], "onto itself nothing moves");
  assert.deepEqual(plMovedTo([], movable, "state", "nope"), [], "onto what is no column nothing moves");
});

test("past every min the table is wider than its room and no column is taken under its min to round it", () => {
  // The mins add up to 624: a room of 620 cannot be made, so nothing is squeezed past them to look like it was.
  const r = resolveColumnWidths(COLS, {}, 620);
  assert.equal(r.widths[1], 220, "name keeps its min");
  assert.equal(r.widths[3], 110, "next keeps its min");
  assert.equal(r.total, 624);
  assert.equal(r.scrolls, true);
});
