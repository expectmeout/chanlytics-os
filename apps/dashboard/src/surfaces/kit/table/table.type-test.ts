/**
 * What the kit's table takes, proved where the compiler reads it (data-table.tsx, columns.ts). A column says how it
 * sorts with a first way and a value the comparer can order, a row has an id and a name, the page names its own classes
 * for the box, the scroller and the table alone, and its groups are drawn plainly or as the Pipeline's stages; what would
 * draw a wrong table stops compiling: a sort with no first way or one the table lacks, a value it cannot order, a row
 * with no id, a class for a part the table does not have, a kind of group the kit does not draw, and a table with no
 * state, which holds its sort, its columns and its widths.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It takes the types through the kit's index, as a surface does, and the component
 * from its own module (the index names the table's types alone); nothing imports it, so no bundle reaches it, and the
 * calls are in a function nothing calls.
 */
import type { ReactElement } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { DataCard, DataColumn, DataTableProps, Density, SortDir } from "../index";
import { DataTable } from "./data-table";

/** A page's row, made up, and what its cells know. */
type Person = { id: string; name: string; visits: number };
type Known = { tz: string };

/** Never called: the compiler reads it, and nothing runs it. */
function _tableTakes(
  td: ReactElement<{ className?: string }>,
  model: DataTableProps<Person, Known>["table"],
  state: DataTableProps<Person, Known>["state"],
): void {
  type _Its = [
    Holds<Exactly<SortDir, "asc" | "desc">>,
    Holds<Exactly<Density, "comfortable" | "compact">>,
    Holds<Exactly<NonNullable<DataColumn<Person>["sort"]>["first"], SortDir>>,
    // The groups' heads: plainly, or as the Pipeline's stages.
    Holds<Exactly<DataTableProps<Person, Known>["groups"], "stages" | null | undefined>>,
  ];
  const name: DataColumn<Person, Known> = {
    key: "name",
    label: "Person",
    fill: true,
    sort: { first: "asc", value: (p) => p.name },
    cell: () => td,
  };
  const visits: DataColumn<Person, Known> = {
    key: "visits",
    label: "Visits",
    align: "end",
    width: { base: 96, max: 160 },
    sort: { first: "desc", value: (p) => p.visits },
    csv: { head: "Visits", cell: (p) => String(p.visits) },
    cell: () => td,
  };
  // A filter's own column: never drawn, holding which rows a value of the page's keeps.
  const often: DataColumn<Person, Known> = {
    key: "f_often",
    label: "",
    hidden: true,
    filter: (p, v) => p.visits >= Number(v),
  };
  const card: DataCard<Person, Known> = { label: "Person", cell: () => td, rowClass: "pl-card-row" };
  const needs = {
    table: model,
    rows: [] as Person[],
    state,
    ctx: { tz: "UTC" },
    total: 0,
    filtered: false,
    onClearFilters: () => undefined,
    sortBy: "name",
    sortDir: "asc" as const,
    onSort: () => undefined,
    onOpen: () => undefined,
  };
  DataTable({ ...needs, columns: [name, visits, often] });
  DataTable({ ...needs, columns: [name], card, selectable: true, groups: "stages", sections: [] });
  DataTable({
    ...needs,
    columns: [name],
    classNames: { wrap: "cl-table-wrap", scroll: "pl-table-scroll", table: "cl-table" },
  });

  const column = (c: DataColumn<Person>) => c;
  // @ts-expect-error a sort with no first way: the heading's first press would not know which way to go
  column({ key: "x", label: "X", sort: {} });
  // @ts-expect-error a first way the table lacks
  column({ key: "x", label: "X", sort: { first: "up" } });
  // @ts-expect-error a value the comparer cannot order: a number or words, or nothing
  column({ key: "x", label: "X", sort: { first: "asc", value: () => new Date() } });
  // @ts-expect-error a row with no id is no table row: the cursor, the selection and the row's element need it
  type _NoId = DataColumn<{ name: string }>;
  // @ts-expect-error a class for a part the table does not have
  DataTable({ ...needs, columns: [name], classNames: { head: "x" } });
  // @ts-expect-error a kind of group the kit does not draw
  DataTable({ ...needs, columns: [name], groups: "cards" });
  const stateless: Omit<typeof needs, "state"> = needs;
  // @ts-expect-error a table with no state: its sort, its columns and its widths are the state's
  DataTable({ ...stateless, columns: [name] });
}
