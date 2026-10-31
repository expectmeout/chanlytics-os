/**
 * A table's saved view and its state (decision 0083, §7): kit/table/view.ts (the wire's shape both ways, read with
 * care) and kit/table/state.ts (the atoms, the acts on them, and the rules the engine before this one kept for saving:
 * this device's copy on every change, the workspace's once per change and never before it is known unless the member
 * changed something here, the workspace's copy taken once as it lands, a drag saved when it ends). Drawn on the suite's
 * stub React over a stand-in store that records what it is asked to keep.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, settle } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

installLegacyReact();
const { fromView, toView, viewKey, extraOf } = await importSrc("apps/dashboard/src/surfaces/kit/table/view.ts");
const { useTableState, narrowedBy, sortingFor, chosenSortOf } = await importSrc(
  "apps/dashboard/src/surfaces/kit/table/state.ts",
);
const { TABLE_MAX_PX, isMovable, isSizable, isLocked } = await importSrc(
  "apps/dashboard/src/surfaces/kit/table/columns.ts",
);
const { PL_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/people/cells/columns.tsx");
const { LEAD_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/leads/cells/columns.tsx");
const { pipeGlassColumns } = await importSrc("apps/dashboard/src/surfaces/people/pipeline/columns.tsx");

const h = (...a) => globalThis.React.createElement(...a);
const COLS = [
  { key: "name", label: "Person", sort: { first: "asc" }, fill: true, width: { base: 300 } },
  { key: "state", label: "State", sort: { first: "desc" } },
  { key: "next", label: "Next", sort: { first: "asc" } },
  { key: "email", label: "Email", on: false },
  { key: "actions", label: "", fixed: true },
];
const FIRST = { by: "state", dir: "desc" };

test("a saved view is read with care: a sort this page cannot sort gives way to the first, its way kept; choices, widths, order, height", () => {
  const v = fromView(
    {
      sortBy: "nope",
      sortDir: "asc",
      columns: { email: true, name: false, actions: false, state: "x" },
      widths: { state: 190.4, actions: 90, gone: 3 },
      order: ["next", "next", "name", "state"],
      density: "compact",
      layout: "board",
    },
    COLS,
    FIRST,
    { layout: "list" },
  );
  assert.deepEqual(v, {
    by: "state",
    dir: "asc",
    columns: { email: true },
    widths: { state: 190 },
    order: ["next", "state"],
    density: "compact",
    extra: { layout: "board" },
  });
  assert.deepEqual(fromView(null, COLS, FIRST), {
    by: "state",
    dir: "desc",
    columns: {},
    widths: {},
    order: [],
    density: "comfortable",
    extra: null,
  });
  assert.deepEqual(
    extraOf({ layout: 7 }, { layout: "list" }),
    { layout: "list" },
    "a value of another type is no choice",
  );
});

test("a view as the wire keeps it: the keys in the order they were always written, each only where it says something", () => {
  const plain = { by: "last", dir: "desc", columns: {}, widths: {}, order: [], density: "comfortable", extra: null };
  assert.equal(
    viewKey(toView(plain)),
    '{"sortBy":"last","sortDir":"desc","columns":{}}',
    "a view nobody changed stays as small as it was",
  );
  assert.equal(
    viewKey(toView(plain, "all")),
    '{"list":"all","sortBy":"last","sortDir":"desc","columns":{}}',
    "Leads' rail row first, as Leads' view always carried it",
  );
  const all = {
    ...plain,
    columns: { email: true },
    widths: { state: 200 },
    order: ["next"],
    density: "compact",
    extra: { layout: "board" },
  };
  assert.deepEqual(Object.keys(toView(all)), ["sortBy", "sortDir", "columns", "widths", "order", "density", "layout"]);
  const round = fromView(toView({ ...all, by: "next", dir: "asc" }), COLS, FIRST, { layout: "list" });
  assert.deepEqual(round, { ...all, by: "next", dir: "asc" }, "and back again, whole");
});

test("the largest view any scope can save stays under the route's 2,000 characters", () => {
  const largest = (columns, row, extra) => {
    const parts = {
      by: columns.find((c) => c.sort && !c.hidden).key,
      dir: "desc",
      columns: Object.fromEntries(columns.filter((c) => !isLocked(c) && !c.hidden).map((c) => [c.key, c.on === false])),
      widths: Object.fromEntries(columns.filter(isSizable).map((c) => [c.key, TABLE_MAX_PX])),
      order: columns
        .filter(isMovable)
        .map((c) => c.key)
        .reverse(),
      density: "compact",
      extra,
    };
    return viewKey(toView(parts, row)).length;
  };
  for (const [scope, columns, row, extra] of [
    ["people", PL_COLUMNS, undefined, null],
    ["leads", LEAD_COLUMNS, "all", null],
    ["pipeline", pipeGlassColumns(), undefined, { layout: "board" }],
  ]) {
    const n = largest(columns, row, extra);
    assert.ok(n < 2000, `${scope}: ${n} characters`);
  }
});

/** A store that records what it keeps on the device and what it sends the workspace. */
function recorder(device = {}) {
  const kept = [];
  const sent = [];
  return {
    kept,
    sent,
    store: {
      load: () => ({ ...device }),
      save: (_scope, v) => kept.push(v),
      saver: () => (v) => sent.push(v),
    },
  };
}

let held = null;
function Page(p) {
  held = useTableState({ scope: "people", columns: COLS, first: FIRST, ...p });
  return null;
}
const draw = (p) => again(() => h(Page, p));

test("the device's copy is kept from the first draw; the workspace's copy waits until it is known, unless the member chose here", async () => {
  const r = recorder({ sortBy: "next", sortDir: "asc" });
  fresh();
  draw({ store: r.store, saved: null, landed: false });
  await settle();
  assert.deepEqual(
    chosenSortOf(held.sorting, FIRST),
    { by: "next", dir: "asc" },
    "the device's copy is read as the page opens",
  );
  assert.equal(r.kept.length > 0, true, "and kept again");
  assert.deepEqual(r.sent, [], "nothing goes to the workspace before its copy is known");
  held.setSort("name", "asc");
  await settle();
  assert.deepEqual(
    r.sent.map((v) => [v.sortBy, v.sortDir]),
    [["name", "asc"]],
    "a choice made here stands and is saved",
  );
  // The workspace's copy lands after: taken over a choice made here it is not.
  draw({ store: r.store, saved: { sortBy: "state", sortDir: "asc" }, landed: true });
  await settle();
  assert.deepEqual(chosenSortOf(held.sorting, FIRST), { by: "name", dir: "asc" });
});

test("the workspace's copy is taken once as it lands, and taking it is no change to save back", async () => {
  const r = recorder({ sortBy: "next", sortDir: "asc" });
  fresh();
  draw({ store: r.store, saved: null, landed: false });
  draw({
    store: r.store,
    saved: { sortBy: "state", sortDir: "asc", columns: { email: true }, widths: { state: 222 } },
    landed: true,
  });
  await settle();
  draw({
    store: r.store,
    saved: { sortBy: "state", sortDir: "asc", columns: { email: true }, widths: { state: 222 } },
    landed: true,
  });
  assert.deepEqual(chosenSortOf(held.sorting, FIRST), { by: "state", dir: "asc" });
  assert.equal(held.visibility.email, true);
  assert.equal(held.atoms.columnSizing.get().state, 222);
  assert.deepEqual(r.sent, [], "nothing was written back for the copy it took");
  held.setSort("next", "desc");
  await settle();
  assert.equal(r.sent.length, 1, "a change once it is known: one save");
  held.setSort("next", "desc");
  await settle();
  assert.equal(r.sent.length, 1, "the same view again is no second save");
});

test("a drag's width is live and saved once, when it ends; a drag that ends with nothing to keep puts the widths back", async () => {
  const r = recorder();
  fresh();
  draw({ store: r.store, saved: null, landed: true });
  await settle();
  const keptBefore = r.kept.length;
  held.startSizing("state");
  held.sizeColumn("state", 150, false);
  held.sizeColumn("state", 170, false);
  await settle();
  assert.equal(held.atoms.columnSizing.get().state, 170, "the width follows the pointer");
  assert.equal(r.kept.length, keptBefore, "nothing is saved while the drag is under way, not even on the device");
  held.sizeColumn("state", 180, true);
  await settle();
  assert.deepEqual(
    r.sent.map((v) => v.widths),
    [{ state: 180 }],
    "one save, at the end",
  );
  held.startSizing("next");
  held.sizeColumn("next", 260, false);
  held.cancelSizing();
  await settle();
  assert.deepEqual(held.atoms.columnSizing.get(), { state: 180 }, "a cancelled drag keeps nothing");
  assert.equal(r.sent.length, 1);
  held.resetWidth("state");
  await settle();
  assert.deepEqual(r.sent.at(-1).widths, undefined, "a width given back is no key of the view");
});

test("the columns' acts: a switch, a column put back to its default, the locked ones, an order, the row height, the way back", async () => {
  const r = recorder();
  fresh();
  draw({ store: r.store, saved: null, landed: true });
  held.toggleColumn("email");
  await settle();
  assert.deepEqual(r.sent.at(-1).columns, { email: true });
  held.toggleColumn("email");
  await settle();
  assert.deepEqual(r.sent.at(-1).columns, {}, "back to its default it is no choice: it follows the default again");
  const n = r.sent.length;
  held.toggleColumn("name");
  held.toggleColumn("actions");
  await settle();
  assert.equal(r.sent.length, n, "Person and the row's acts are not the member's to hide");
  held.moveColumns(["next", "state"]);
  await settle();
  assert.deepEqual(r.sent.at(-1).order, ["next", "state"]);
  held.moveColumns(["next", "state"]);
  await settle();
  assert.equal(r.sent.at(-1).order.length, 2, "a move that changes nothing saves nothing new");
  held.setDensity("compact");
  held.sizeColumn("state", 200, true);
  await settle();
  assert.equal(r.sent.at(-1).density, "compact");
  held.resetLayout();
  await settle();
  assert.deepEqual([r.sent.at(-1).widths, r.sent.at(-1).order], [undefined, undefined], "every width and place back");
  held.setExtra({ layout: "board" });
  await settle();
  assert.equal(r.sent.at(-1).layout, "board");
});

test("Leads' rail row rides in its view, first, and a row picked is a change to save", async () => {
  const r = recorder({ list: "ready", sortBy: "fit", sortDir: "asc" });
  fresh();
  function LeadsPage({ railRow }) {
    held = useTableState({
      scope: "leads",
      columns: [
        { key: "fit", label: "Fit", sort: { first: "desc" } },
        { key: "business", label: "Business", fill: true },
      ],
      first: { by: "fit", dir: "asc" },
      store: r.store,
      saved: null,
      landed: true,
      railRow,
    });
    return null;
  }
  const leads = (railRow) => again(() => h(LeadsPage, { railRow }));
  leads("ready");
  await settle();
  assert.deepEqual(r.sent, [], "the view as it opened is the one the workspace holds");
  const atoms = held.atoms;
  leads("nurture");
  await settle();
  assert.equal(held.atoms, atoms, "the same page, its atoms kept");
  assert.deepEqual(Object.keys(r.sent.at(-1)), ["list", "sortBy", "sortDir", "columns"]);
  assert.equal(r.sent.at(-1).list, "nurture");
});

test("the sort the atom holds: the member's entry first, then the page's tiebreak; narrowed is a filter or words", () => {
  const then = (key) => (key === "last" ? [] : [{ id: "last", desc: true }]);
  assert.deepEqual(sortingFor("state", "asc", then), [
    { id: "state", desc: false },
    { id: "last", desc: true },
  ]);
  assert.deepEqual(chosenSortOf(sortingFor("state", "asc", then), FIRST), { by: "state", dir: "asc" });
  assert.deepEqual(chosenSortOf([], FIRST), FIRST);
  assert.equal(narrowedBy([], ""), false);
  assert.equal(narrowedBy([], "  "), false, "spaces are no words");
  assert.equal(narrowedBy([], "ann"), true);
  assert.equal(narrowedBy([{ id: "f_reach", value: ["email"] }], ""), true);
});
