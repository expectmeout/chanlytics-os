/**
 * People's rows as People's page shows them (decision 0083), for a test that asks who a view shows and in what order:
 * the view's rows (its state tab and its lists, page/shown.ts `plViewRows`), through the kit's table state and table as
 * the page holds them (kit/table/state.ts, use-data-table.ts) — the sort read from a saved view (`fromView`: a heading
 * the page cannot sort falls back to the page's first, its way kept), the page's tiebreak (cells/sorts.ts `plSortThen`)
 * and the box's words as the table's global filter (`plMatcher`). Drawn on the suite's stub React, which the test
 * installs first (`installLegacyReact`); then `peopleOrder()` hands it the function.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { fresh, again } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

/** The function that answers who a view of People shows, in order: made once the stub React is in place. */
export async function peopleOrder() {
  const { useTableState, sortingFor, chosenSortOf } = await importSrc("apps/dashboard/src/surfaces/kit/table/state.ts");
  const { useDataTable } = await importSrc("apps/dashboard/src/surfaces/kit/table/use-data-table.ts");
  const { columnsIn } = await importSrc("apps/dashboard/src/surfaces/kit/table/columns.ts");
  const { plViewRows } = await importSrc("apps/dashboard/src/surfaces/people/page/shown.ts");
  const { PL_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/people/cells/columns.tsx");
  const { plSortThen } = await importSrc("apps/dashboard/src/surfaces/people/cells/sorts.ts");
  const { plMatcher } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
  const FIRST = { by: "last", dir: "desc" };
  const h = (...a) => globalThis.React.createElement(...a);
  /** The ids a view shows, in its order: every heading this page declares sorts (a calendar is connected). */
  return function peopleShown({
    rows,
    found = null,
    lists = [],
    saved = [],
    tab = "all",
    listId = null,
    savedId = null,
    q = "",
    sortBy = "last",
    sortDir = "desc",
  }) {
    const store = { load: () => ({ sortBy, sortDir }), save() {}, saver: () => () => {} };
    const declared = columnsIn(PL_COLUMNS, { withCalendar: true, word: "appointment" });
    const viewRows = plViewRows({ rows, found, lists, saved, tab, listId, savedId });
    let made = null;
    function Probe() {
      const state = useTableState({
        scope: "people",
        columns: PL_COLUMNS,
        first: FIRST,
        sortThen: plSortThen,
        saved: null,
        landed: false,
        store,
      });
      // The sort the page applies: the member's, every heading here showing (people/hooks/use-controls.ts `applied`).
      const chosen = chosenSortOf(state.sorting, FIRST);
      const model = useDataTable({
        state,
        columns: declared,
        data: viewRows,
        words: plMatcher,
        sorting: sortingFor(chosen.by, chosen.dir, plSortThen),
      });
      made = { state, rows: model.rows };
      return null;
    }
    fresh();
    again(() => h(Probe));
    if (q) {
      made.state.setWords(q);
      again(() => h(Probe));
    }
    return made.rows.map((p) => p.id);
  };
}
