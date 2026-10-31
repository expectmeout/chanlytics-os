/**
 * How wide a desk's table and its columns stand, and where the columns stand (decision 0083, §6.1): kit/table/widths.ts
 * (the two ways a table takes its box, the fill column's share while it scrolls, the writer) and the rules over a
 * member's widths and order in kit/table/columns.ts. The sums are pure and run as they are; the writer runs over a
 * stand-in for the table's elements, since what it writes is attributes and one custom property.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { drawnWidths, writeWidths, markMore } = await importSrc("apps/dashboard/src/surfaces/kit/table/widths.ts");
const {
  TABLE_MAX_PX,
  TABLE_MIN_PX,
  TABLE_SELECT_PX,
  clampWidth,
  densityOf,
  fitWidth,
  movedBy,
  movedTo,
  orderOf,
  orderedColumns,
  reordered,
  widthsOf,
} = await importSrc("apps/dashboard/src/surfaces/kit/table/columns.ts");

/** A table shaped like People's: its fill column, three that keep their own widths, the row's acts. */
const COLS = [
  { key: "name", fill: true, width: { base: 300, min: 240, max: 560 } },
  { key: "state", width: { base: 128, min: 118, max: 240 } },
  { key: "next", width: { base: 140 } },
  { key: "last", width: { base: 124 } },
  { key: "actions", fixed: true, width: { base: 84 } },
];
const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);

test("filling: nobody has sized the fill column, so it takes the room the others leave and the table is its box", () => {
  const r = drawnWidths(COLS, {}, 1000, true);
  assert.equal(r.sizing, "fill");
  assert.deepEqual(r.widths, [null, 128, 140, 124, 84], "the fill column's width is the room left: none written");
  assert.equal(
    r.total,
    TABLE_SELECT_PX + 128 + 140 + 124 + 84 + 240,
    "its least: the others, the box, the fill column's least",
  );
  // Another column dragged wider takes its room from the fill column, which the browser gives the rest: no other moves.
  const wider = drawnWidths(COLS, { state: 208 }, 1000, true);
  assert.equal(wider.sizing, "fill");
  assert.deepEqual(wider.widths, [null, 208, 140, 124, 84]);
  // Without the select box the least is the columns' alone.
  assert.equal(drawnWidths(COLS, {}, 1000, false).total, 128 + 140 + 124 + 84 + 240);
  // A width kept for a column not drawn sizes nothing here.
  assert.equal(drawnWidths(COLS, { phone: 300 }, 1000, true).sizing, "fill");
});

test("sized: a member sized the fill column, so every width is theirs or where it starts, and the table is their sum", () => {
  const r = drawnWidths(COLS, { name: 360 }, 1400, true);
  assert.equal(r.sizing, "sized");
  assert.deepEqual(r.widths, [360, 128, 140, 124, 84], "nobody else takes the room a sized table leaves");
  assert.equal(r.total, TABLE_SELECT_PX + sum(r.widths), "room after the last column");
  // A 100px drag moves its edge 100px: the columns before it hold still.
  const wider = drawnWidths(COLS, { name: 360, state: 228 }, 1400, true);
  assert.equal(sum(wider.widths.slice(0, 2)) - sum(r.widths.slice(0, 2)), 100);
  // Short of room nothing gives way but the fill column, and only to its share: the table scrolls.
  const short = drawnWidths(COLS, { name: 360, next: 295 }, 700, true);
  assert.ok(short.total > 700, "the table scrolls inside its box");
});

test("the fill column gives way to its share of the box while the table scrolls, and only as far as it then fits", () => {
  // Production, 27-28 Oct 2026: Person saved at 979px, pinned, in an 888px box, stood over every other column.
  const four = drawnWidths(COLS.slice(0, 2).concat(COLS[3], COLS[4]), { name: 979, state: 144, last: 212 }, 888, true);
  assert.deepEqual(four.widths, [406, 144, 212, 84], "Person gives up just enough for the table to fit");
  assert.equal(four.total, 888);
  const many = [
    ...COLS.slice(0, 2),
    COLS[3],
    { key: "calls", width: { base: 84 } },
    { key: "next", width: { base: 140 } },
    { key: "offers", width: { base: 108 } },
    { key: "visits", width: { base: 144 } },
    COLS[4],
  ];
  const saved = { name: 979, state: 144, last: 212, calls: 56, next: 295, offers: 183, visits: 162 };
  const full = drawnWidths(many, saved, 888, true);
  assert.equal(full.widths[0], 400, "45% of the box");
  assert.deepEqual(full.widths.slice(1, 7), [144, 212, 56, 295, 183, 162], "every other width as chosen");
  assert.equal(
    drawnWidths(many, saved, 4000, true).widths[0],
    979,
    "on a box wide enough the width chosen is drawn whole",
  );
  assert.equal(
    drawnWidths(COLS, { name: 979, state: 400, last: 400 }, 400, true).widths[0],
    240,
    "never under its own least",
  );
  assert.equal(drawnWidths(COLS, { name: 979 }, null, true).widths[0], 979, "before the box is measured, as chosen");
});

/** A stand-in for a drawn table: its colgroup's cols, its edges and the box it scrolls in. */
function standIn(keys) {
  const attrs = {};
  const props = {};
  const cols = keys.map((key) => {
    const a = { "data-col": key };
    return {
      a,
      getAttribute: (n) => a[n] ?? null,
      setAttribute: (n, v) => {
        a[n] = v;
      },
      removeAttribute: (n) => {
        delete a[n];
      },
    };
  });
  const edges = keys.map((key, i) => {
    const a = {};
    return {
      a,
      setAttribute: (n, v) => {
        a[n] = v;
      },
      closest: () => ({ getBoundingClientRect: () => ({ width: 100 + i }) }),
    };
  });
  const box = {
    scrollLeft: 0,
    clientWidth: 600,
    scrollWidth: 900,
    on: {},
    toggleAttribute(n, on) {
      this.on[n] = on;
    },
  };
  const table = {
    attrs,
    props,
    parentElement: box,
    setAttribute: (n, v) => {
      attrs[n] = v;
    },
    removeAttribute: (n) => {
      delete attrs[n];
    },
    style: {
      setProperty: (n, v) => {
        props[n] = v;
      },
      removeProperty: (n) => {
        delete props[n];
      },
    },
    querySelectorAll: (sel) => (sel.includes("col[data-col]") ? cols : sel.includes("[data-edge]") ? edges : []),
  };
  return { table, cols, edges, box };
}

test("the writer: each col its width, the fill column's none while it fills, the table how it is sized, each edge its width", () => {
  const { table, cols, edges, box } = standIn(COLS.map((c) => c.key));
  writeWidths(table, COLS, drawnWidths(COLS, {}, 1000, true));
  assert.equal(table.attrs["data-sizing"], "fill");
  assert.equal(table.props["--tbl-width"], undefined, "a filling table is its box's width (the stylesheet's)");
  assert.equal(
    table.props["--tbl-min"],
    `${TABLE_SELECT_PX + 128 + 140 + 124 + 84 + 240}px`,
    "and never under its least",
  );
  assert.deepEqual(
    cols.map((c) => c.a.width ?? null),
    [null, "128", "140", "124", "84"],
  );
  assert.deepEqual(
    edges.map((e) => e.a["aria-valuenow"]),
    ["100", "101", "102", "103", "104"],
    "each edge says the width its heading stands at, the fill column's too",
  );
  assert.equal(edges[0].a["aria-valuemax"], String(TABLE_MAX_PX));
  assert.equal(box.on["data-more"], true, "the box says it scrolls further right, for its edge's line");
  writeWidths(table, COLS, drawnWidths(COLS, { name: 360 }, 2000, true));
  assert.equal(table.attrs["data-sizing"], "sized");
  assert.equal(
    table.props["--tbl-width"],
    `${TABLE_SELECT_PX + 360 + 128 + 140 + 124 + 84}px`,
    "the sum, as its own width, which the stylesheet reads (a width attribute is outranked by its width: 100%)",
  );
  assert.equal(table.props["--tbl-min"], undefined);
  assert.equal(table.attrs.width, undefined, "no width attribute: nothing a stylesheet's width would quietly outrank");
  assert.equal(cols[0].a.width, "360");
  writeWidths(table, COLS, drawnWidths(COLS, {}, 2000, true));
  assert.equal(table.props["--tbl-width"], undefined, "back to filling, the member's width goes with it");
  box.scrollLeft = 300;
  markMore(box);
  assert.equal(box.on["data-more"], false, "scrolled to its end: no more to its right");
});

test("a width as a drag or a key leaves it: whole pixels in the table's bounds, never shrunk below where a wide window put it", () => {
  assert.equal(clampWidth(20), TABLE_MIN_PX);
  assert.equal(clampWidth(130.6), 131);
  assert.equal(clampWidth(5000), TABLE_MAX_PX);
  assert.equal(clampWidth(1500, 1450), 1450, "a column standing wider than the most keeps where it stands");
  assert.equal(clampWidth(1400, 1450), 1400);
});

test("a fit is what the column holds, never past the most it asks for nor outside the table's bounds", () => {
  const person = { base: 300, min: 240, max: 560 };
  assert.equal(fitWidth(1111, person), 560, "Person fitted to every word stops at its most");
  assert.equal(fitWidth(301.4, person), 301);
  assert.equal(fitWidth(20, person), TABLE_MIN_PX);
  assert.equal(fitWidth(5000, { base: 84 }), TABLE_MAX_PX, "a column with no most stops at the table's");
  assert.equal(fitWidth(140), 140);
});

test("saved widths, an order and a row height are read with care", () => {
  const cols = [{ key: "name", fill: true }, { key: "state" }, { key: "last" }, { key: "actions", fixed: true }];
  assert.deepEqual(
    widthsOf(cols, { state: 190.4, name: 300, actions: 90, gone: 120, last: "wide" }),
    { state: 190, name: 300 },
    "a fixed column and an unknown one have no width of their own",
  );
  assert.deepEqual(widthsOf(cols, { state: 5, last: 99999 }), { state: TABLE_MIN_PX, last: TABLE_MAX_PX });
  assert.deepEqual(widthsOf(cols, [1]), {});
  assert.deepEqual(
    orderOf(cols, ["last", "last", "state", "name", "gone", 7]),
    ["last", "state"],
    "once each, only columns a member may move",
  );
  assert.deepEqual(orderOf(cols, "state"), []);
  assert.equal(densityOf("compact"), "compact");
  assert.equal(densityOf("tall"), "comfortable");
});

test("a member's order puts the columns they placed first; the fill column stays first and the row's acts last", () => {
  const cols = [
    { key: "name", fill: true },
    { key: "state" },
    { key: "next" },
    { key: "last" },
    { key: "actions", fixed: true },
  ];
  assert.deepEqual(
    orderedColumns(cols, ["last", "state"]).map((c) => c.key),
    ["name", "last", "state", "next", "actions"],
  );
  assert.deepEqual(
    orderedColumns(cols, []).map((c) => c.key),
    ["name", "state", "next", "last", "actions"],
    "no choice keeps the page's own order",
  );
  assert.deepEqual(
    orderedColumns(cols, ["nope", "next"]).map((c) => c.key),
    ["name", "next", "state", "last", "actions"],
    "a key that is no column is nothing",
  );
});

test("a column moves one place among the ones a member may move, and no further than the ends", () => {
  const movable = ["state", "next", "last"];
  assert.deepEqual(movedBy([], movable, "last", -1), ["state", "last", "next"]);
  assert.deepEqual(movedBy(["last", "state", "next"], movable, "state", 1), ["last", "next", "state"]);
  assert.deepEqual(movedBy([], movable, "state", -1), [], "the first column cannot go earlier: nothing changes");
  assert.deepEqual(movedBy(["state"], movable, "last", 1), ["state"]);
});

test("a column dragged onto another lands before it from the right and after it from the left, and keeps the rest in order", () => {
  const movable = ["state", "next", "last", "visits"];
  assert.deepEqual(
    movedTo([], movable, "last", "state"),
    ["last", "state", "next", "visits"],
    "from the right: before",
  );
  assert.deepEqual(movedTo([], movable, "state", "last"), ["next", "last", "state", "visits"], "from the left: after");
  assert.deepEqual(movedTo(["visits", "state"], movable, "next", "visits"), ["next", "visits", "state", "last"]);
  assert.deepEqual(movedTo([], movable, "state", "state"), [], "onto itself nothing moves");
  assert.deepEqual(movedTo([], movable, "state", "nope"), [], "onto what is no column nothing moves");
});

test("an order changed keeps the columns not drawn where they stood, and a move that changes nothing is no change", () => {
  assert.deepEqual(reordered(["calls", "state", "next"], ["next", "state"]), ["next", "state", "calls"]);
  assert.equal(reordered(["state", "next"], ["state", "next"]), null, "a column at the end of its row moved nowhere");
});
