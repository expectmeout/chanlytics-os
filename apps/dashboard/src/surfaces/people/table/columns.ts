/**
 * The table's columns, for any rows (moved whole from legacy/pages/people-table.jsx, decision 0015): every helper takes
 * the column list, so People's PL_COLUMNS and the Leads scope's own go through the same rules. Where a column stands and
 * how wide it is are the member's to change (layout.ts); which ones show is here.
 */
import type { ColCtx, TableColumn } from "../types";

/** A column of any rows: what a scope hands the table. */
type AnyColumn = TableColumn<never, never>;
type ColumnLike = Pick<AnyColumn, "key" | "label" | "labelOf" | "sortable" | "pinned" | "fixed" | "on" | "needs">;

/** A column with its heading in the workspace's words where it has them (labelOf), else its own. */
const withHeading = <C extends ColumnLike>(c: C, x: ColCtx): C => (c.labelOf ? { ...c, label: c.labelOf(x) } : c);

/** Person and the row's actions are not the member's to hide. */
export const plLocked = (c: ColumnLike): boolean => !!(c.pinned || c.fixed);

/** Whether a column shows on a desktop: Person and the row's actions always; any other by the member's own choice, else its default. */
export const plShows = (c: ColumnLike, choices: Record<string, boolean>, x: ColCtx): boolean => {
  const chosen = choices[c.key];
  return plLocked(c) || (typeof chosen === "boolean" ? chosen : typeof c.on === "function" ? c.on(x) : c.on !== false);
};

/** The keys a view may sort by: the columns whose headings sort. */
export const plSortKeys = (columns: readonly ColumnLike[]): string[] =>
  columns.filter((c) => c.sortable).map((c) => c.key);

/** Which way a first press on a heading goes: the column's own word, else the most first. */
export const plFirstDir = (columns: readonly Pick<AnyColumn, "key" | "sortFirst">[], key: string): "asc" | "desc" =>
  columns.find((c) => c.key === key)?.sortFirst ?? "desc";

/**
 * The columns a desktop draws: every one this workspace can show (Visits needs a calendar) that the member has not
 * turned off. A phone draws one card a row instead (PL_PHONE_COLUMNS), whatever was chosen, so a member's choices are a
 * desktop's and a card keeps the facts it draws by default.
 */
export const plShownColumns = <C extends ColumnLike>(
  columns: readonly C[],
  choices: Record<string, boolean>,
  x: ColCtx,
): C[] => columns.filter((c) => (!c.needs || c.needs(x)) && plShows(c, choices, x)).map((c) => withHeading(c, x));

/** A saved `columns` value, read with care: only the columns a member may hide, and only true or false. */
export const plColumnChoices = (columns: readonly ColumnLike[], raw: unknown): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const saved = raw as Record<string, unknown>;
  for (const c of columns) {
    const v = saved[c.key];
    if (!plLocked(c) && typeof v === "boolean") out[c.key] = v;
  }
  return out;
};

/** A row of the Columns menu: the column's key, its heading's words, whether it shows, and whether it always does. */
export type ColumnOption = { key: string; label: string; on: boolean; locked: boolean };

/**
 * The Columns menu's rows: every column this workspace can show, whether it shows, and Person, which always does. A
 * switch is named by its words, which typing finds, so a column headed by no words (the Pipeline's chip and acts, a
 * screen reader's alone) is not one: each such column is fixed as well.
 */
export const plColumnOptions = (
  columns: readonly ColumnLike[],
  choices: Record<string, boolean>,
  x: ColCtx,
): ColumnOption[] =>
  columns.flatMap((c) => {
    const label = c.labelOf ? c.labelOf(x) : c.label;
    return !c.fixed && (!c.needs || c.needs(x)) && typeof label === "string"
      ? [{ key: c.key, label, on: plShows(c, choices, x), locked: !!c.pinned }]
      : [];
  });
