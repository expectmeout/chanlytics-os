/**
 * The table's columns, for any rows (moved whole from legacy/pages/people-table.jsx, decision 0015): every helper takes
 * the column list, so People's PL_COLUMNS and the Leads scope's own go through the same rules.
 */
import type { ReactNode } from "react";
import type { ColCtx, TableColumn } from "../types";

/** A column of any rows: what a scope hands the table. */
type AnyColumn = TableColumn<never, never>;
type ColumnLike = Pick<AnyColumn, "key" | "label" | "sortable" | "pinned" | "fixed" | "on" | "needs" | "off">;

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

/**
 * The columns drawn, in their order: every one this workspace can show (Visits needs a calendar). A member's choices are
 * a desktop's: one they turned off is drawn all the same, `off`, and only a desktop hides it (clients.css, pl-col-off),
 * so a phone's cards keep the facts they draw by default.
 */
export const plDrawnColumns = <C extends ColumnLike>(
  columns: readonly C[],
  choices: Record<string, boolean>,
  x: ColCtx,
): C[] => columns.filter((c) => !c.needs || c.needs(x)).map((c) => (plShows(c, choices, x) ? c : { ...c, off: true }));

/** The columns the table is handed: on a phone every one, the ones off marked; on a desktop only what shows. */
export const plShownColumns = <C extends ColumnLike>(drawn: readonly C[], phone: boolean): C[] =>
  phone ? [...drawn] : drawn.filter((c) => !c.off);

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

/** The Columns menu's rows: every column this workspace can show, whether it shows, and Person, which always does. */
export const plColumnOptions = (
  columns: readonly ColumnLike[],
  choices: Record<string, boolean>,
  x: ColCtx,
): { key: string; label: ReactNode; on: boolean; locked: boolean }[] =>
  columns
    .filter((c) => !c.fixed && (!c.needs || c.needs(x)))
    .map((c) => ({ key: c.key, label: c.label, on: plShows(c, choices, x), locked: !!c.pinned }));
