// The kit's table binding (decision 0083) draws a TanStack table on the suite's stub React, and the
// table's own state moves what is drawn: the lane's step 0, kept as the binding's first test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, all, textOf, redrawWanted, quiet } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

installLegacyReact();
const { useTable, useSlice } = await importSrc("apps/dashboard/src/surfaces/kit/table/use-table.ts");
const { tableFeatureSet } = await importSrc("apps/dashboard/src/surfaces/kit/table/features.ts");
const { createColumnHelper } = await import("@tanstack/table-core");

const h = (...a) => globalThis.React.createElement(...a);
const col = createColumnHelper();
const COLUMNS = col.columns([
  col.accessor((p) => p.name || undefined, {
    id: "name",
    sortDescFirst: false,
    sortUndefined: "last",
    enableGlobalFilter: true,
  }),
  col.accessor((p) => p.calls, { id: "calls", sortDescFirst: true, enableGlobalFilter: false }),
  col.accessor((p) => p.state, {
    id: "state",
    filterFn: (row, id, value) => row.getValue(id) === value,
    enableGlobalFilter: false,
  }),
]);
const ROWS = [
  { id: "a", name: "Ada Example", calls: 3, state: "new" },
  { id: "b", name: "", calls: 9, state: "quiet" },
  { id: "c", name: "Cy Example", calls: 1, state: "new" },
  { id: "d", name: "Bo Example", calls: 5, state: "quiet" },
];

let table = null;
function Spike({ rows }) {
  table = useTable({
    features: tableFeatureSet,
    columns: COLUMNS,
    data: rows,
    getRowId: (r) => r.id,
    enableSortingRemoval: false,
    enableMultiSort: false,
    globalFilterFn: (row, _id, words) => row.original.name.toLowerCase().includes(String(words).toLowerCase()),
    meta: { ctx: null },
  });
  // What the body reads: the sorting and the filters, so a change to either draws it again.
  useSlice(table.store, (s) => [s.sorting, s.columnFilters, s.globalFilter, s.rowSelection]);
  return h(
    "tbody",
    null,
    table
      .getRowModel()
      .rows.map((r) =>
        h("tr", { key: r.id, id: r.id, "aria-selected": r.getIsSelected() }, r.original.name || "(unnamed)"),
      ),
  );
}
const draw = () => again(() => h(Spike, { rows: ROWS }));
const ids = (tree) => all(tree, (n) => n.type === "tr").map((n) => n.props.id);

test("the binding draws the rows, and the table's state moves them", () => {
  fresh();
  let tree = draw();
  assert.deepEqual(ids(tree), ["a", "b", "c", "d"], "unsorted: the data's order");

  quiet();
  table.setSorting([{ id: "name", desc: false }]);
  assert.equal(redrawWanted(), true, "a sort asks to be drawn again");
  tree = draw();
  assert.deepEqual(ids(tree), ["a", "d", "c", "b"], "A to Z, the unnamed last");

  table.setSorting([{ id: "name", desc: true }]);
  tree = draw();
  assert.deepEqual(ids(tree), ["c", "d", "a", "b"], "Z to A, the unnamed still last (sortUndefined)");

  table.setSorting([{ id: "calls", desc: true }]);
  tree = draw();
  assert.deepEqual(ids(tree), ["b", "d", "a", "c"], "most calls first");

  table.setColumnFilters([{ id: "state", value: "new" }]);
  tree = draw();
  assert.deepEqual(ids(tree), ["a", "c"], "a column filter narrows");

  table.setColumnFilters([]);
  table.setGlobalFilter("ex");
  tree = draw();
  assert.deepEqual(ids(tree), ["d", "a", "c"], "the words narrow, through one column");

  table.setGlobalFilter("");
  table.getRow("d").toggleSelected(true);
  table.setColumnFilters([{ id: "state", value: "new" }]);
  tree = draw();
  assert.deepEqual(Object.keys(table.store.state.rowSelection), ["d"], "a row a filter hides stays selected");
  assert.equal(table.getFilteredSelectedRowModel().rows.length, 0, "the shown and selected: none");
  assert.equal(textOf(tree).includes("Bo"), false);
});
