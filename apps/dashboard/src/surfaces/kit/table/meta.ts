/**
 * What a column carries for the kit beside what table-core's own definitions say (decision 0083): a column's definition
 * is made from the kit's own declaration (columns.ts `DataColumn`), and carries it, so the heading, the cell, the
 * Columns menu and the file read the one declaration. A cell's context is the table's prop (data-table.tsx `ctx`).
 */
import type { AnyDataColumn } from "./columns";

export interface ChanlyticsColumnMeta {
  /** The declaration the definition was made from. */
  column: AnyDataColumn;
}
