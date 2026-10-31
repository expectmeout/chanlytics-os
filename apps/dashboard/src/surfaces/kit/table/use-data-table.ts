/**
 * A page's table (decision 0083): table-core over the page's rows, plugged into the state the page made first
 * (state.ts), with the definitions the kit makes from the page's columns. The rows it shows are table-core's row model:
 * the page's rows, narrowed by the filters and the words, in the sort's order, unless the server already did either
 * (`server`: Leads' sort is a read of `leads_page`; the Pipeline's order and words are contracts', with its groups).
 *
 * The definitions say what table-core needs and nothing the kit draws: the value a row sorts by (`undefined` last
 * whichever way), the first press's way, words compared in the reader's order, a filter's own test, and which column
 * the words run on (the fill column's, once per row: table-core otherwise runs them per column and ORs them).
 */
import { useMemo } from "react";
import type { ColumnDef, FilterFn, Row, SortingState, Table } from "@tanstack/table-core";
import {
  TABLE_MAX_PX,
  TABLE_MIN_PX,
  baseOf,
  isLocked,
  isSizable,
  type AnyDataColumn,
  type DataColumn,
  type TableRow,
} from "./columns";
import { tableFeatureSet, type AppFeatures } from "./features";
import type { TableState } from "./state";
import { useTable } from "./use-table";

/** The reader's order: "house 2" before "house 10", "Élodie" beside "Elodie". */
const IN_READERS_ORDER = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Two sort values in order: numbers as numbers, words as words in the reader's order. */
export const compareSortValues = (a: unknown, b: unknown): number =>
  typeof a === "string" && typeof b === "string"
    ? IN_READERS_ORDER.compare(a, b)
    : (a as number) < (b as number)
      ? -1
      : (a as number) > (b as number)
        ? 1
        : 0;

/** A column's definition, made from its declaration. */
function definitionOf<R extends TableRow>(c: AnyDataColumn): ColumnDef<AppFeatures, R, unknown> {
  const value = c.sort?.value;
  const filter = c.filter;
  return {
    id: c.key,
    // Every column has an accessor: a filter and the words need one, and a column with no sort reads nothing.
    accessorFn: value ? (row: R) => value(row) : () => undefined,
    header: typeof c.label === "string" ? c.label : c.key,
    enableSorting: !!c.sort,
    // Said on every column that sorts: table-core otherwise guesses it from the first rows' values.
    sortDescFirst: c.sort ? c.sort.first === "desc" : undefined,
    sortUndefined: "last",
    sortFn: (a: Row<AppFeatures, R>, b: Row<AppFeatures, R>, id: string) =>
      compareSortValues(a.getValue(id), b.getValue(id)),
    enableHiding: !isLocked(c) && !c.hidden,
    enableResizing: isSizable(c),
    enableGlobalFilter: !!c.fill,
    ...(filter ? { filterFn: (row: Row<AppFeatures, R>, _id: string, v: unknown) => filter(row.original, v) } : {}),
    size: baseOf(c),
    minSize: TABLE_MIN_PX,
    // The fill column may stand as wide as its box gives it.
    maxSize: c.fill ? Number.MAX_SAFE_INTEGER : TABLE_MAX_PX,
    meta: { column: c },
  };
}

/**
 * Which rows the words leave: the page's matcher, made once for the words, and run on each row once. Words the matcher
 * makes nothing of (spaces) narrow nothing: table-core hands the filter the words themselves where the matcher answers
 * none.
 */
const wordsFilterOf = <R extends TableRow>(matcher: (q: string) => ((row: R) => boolean) | null) =>
  Object.assign(
    (row: Row<AppFeatures, R>, _id: string, match: unknown) =>
      typeof match === "function" ? (match as (row: R) => boolean)(row.original) : true,
    { resolveFilterValue: (q: string) => matcher(q) },
  ) as unknown as FilterFn<AppFeatures, R>;

/** A table drawn from the state it is plugged into. */
export type DataTableModel<R extends TableRow> = Table<AppFeatures, R>;

export interface DataTableArgs<R extends TableRow, X, C> {
  state: TableState;
  /** The columns this workspace declares (columns.ts `columnsIn`), held still while nothing they are made of changes. */
  columns: readonly DataColumn<R, X, C>[];
  /** The view's rows, held still while they are the same rows. */
  data: readonly R[];
  /** What the box's words keep of a row: the page's matcher for them, or none where the words run elsewhere. */
  words?: ((q: string) => ((row: R) => boolean) | null) | null;
  /** What the server or contracts already did: the rows arrive in their order, or narrowed. */
  server?: { sorting?: boolean; filtering?: boolean };
  /**
   * The sort the table applies, where it is not the member's own: a desk's table stands in an order its member can see,
   * so a sort whose column is turned off gives way to the page's first (columns.ts `sortShownOf`) and comes back with its
   * column, while the member's sort stays theirs in the sorting atom. Held still while it is the same sort.
   */
  sorting?: SortingState;
}

/**
 * The table, and the rows it shows in their order. The rows are kept by reference while the row model is, so a page
 * that hands them on (the place, the peek, the bars) sees the same list from one draw to the next.
 */
export function useDataTable<R extends TableRow, X, C>(a: DataTableArgs<R, X, C>) {
  const { state, columns, data, words = null, server = {}, sorting = null } = a;
  // Where the page says which sort the table applies, the sorting atom is the member's and the table is handed the sort.
  const others = useMemo(() => {
    const { sorting: _member, ...rest } = state.atoms;
    return rest;
  }, [state.atoms]);
  const definitions = useMemo(() => columns.map((c) => definitionOf<R>(c)), [columns]);
  const globalFilterFn = useMemo(() => (words ? wordsFilterOf<R>(words) : undefined), [words]);
  const table = useTable<AppFeatures, R>({
    features: tableFeatureSet,
    columns: definitions,
    data,
    getRowId: (row: R) => row.id,
    atoms: sorting ? others : state.atoms,
    ...(sorting ? { state: { sorting } } : {}),
    enableSortingRemoval: false,
    enableMultiSort: false,
    columnResizeMode: "onChange",
    manualSorting: !!server.sorting,
    manualFiltering: !!server.filtering,
    // The words run only through the page's own matcher: none given, they narrow nothing here (the library's own string
    // search would read the fill column's sort value).
    enableGlobalFilter: !!globalFilterFn,
    ...(globalFilterFn ? { globalFilterFn } : {}),
  });
  const model = table.getRowModel();
  const rows = useMemo(() => model.rows.map((r) => r.original), [model]);
  return { table, rows };
}
