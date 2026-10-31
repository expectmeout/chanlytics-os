/**
 * A table's columns, declared once in the kit's own shape (decision 0083): its heading, how it sorts and which way a
 * first press goes, its width and bounds, whether a member may hide it or move it, what it says in a file, and its cell.
 * The kit makes table-core's definitions from it (use-data-table.ts), so a page names no part of the library: the
 * dependency stands behind this seam, as decision 0054 asks, and a page's column keeps its own types (its row, the
 * context its cells read, what the workspace is).
 *
 * Pure: the rules here are sums and lists over the declarations, held by the kit's tests. A cell keeps drawing its own
 * `<td>` (its class, tip, test id and behaviour are its own: Leads' hover cells are components), and the kit marks on it
 * the column it is and where it is pinned (rows.tsx), so pinning and widths are the kit's in one place.
 */
import type { ReactElement, ReactNode } from "react";

/** A row the table can draw: an id it is kept and selected by, and the name its box is read out with. */
export interface TableRow {
  id: string;
  name: string;
}

/** What a row's face says of the selection it is in: a selection under way (`choose`), this row in it (`chosen`), or none. */
export type RowPick = "choose" | "chosen" | undefined;

/** How tall a row stands: the member's choice, saved with the rest of the view. */
export type Density = "comfortable" | "compact";

/** Which way a sort goes. */
export type SortDir = "asc" | "desc";

/** How a column's rows sort, where the browser sorts them. */
export interface ColumnSort<R> {
  /** Which way a first press on its heading goes (names A to Z, the soonest first; else the most first). */
  first: SortDir;
  /**
   * What a row sorts by: a number as a number, words in the reader's order (numeric, accents beside their letters).
   * Nothing (`undefined`) sorts last whichever way. None where the server sorts the rows (Leads).
   */
  value?: (row: R) => number | string | undefined;
}

/** A column's width: where it starts, the least the table gives it as its fill column, and the most a fit takes it to. */
export interface ColumnWidth {
  base: number;
  /** The fill column's least, while it takes the room the others leave; a drag may take any column to the table's least. */
  min?: number;
  /** The most a fit (a double press, Fit all columns) takes it to. */
  max?: number;
}

/**
 * One column. `C` is what the workspace is (a calendar, a search with a centre, its word for a visit), which says
 * whether a column is declared and how its heading reads; `X` is what a cell draws from beside its row.
 */
export interface DataColumn<R extends TableRow, X = unknown, C = unknown> {
  /** Its name: the view's key, the heading's `data-key`, the sort's and the filter's id. */
  key: string;
  /** The heading: a string is also its switch's words in the Columns menu and its edge's name. */
  label: ReactNode;
  /** The heading where it is the workspace's word (the appointments column), over `label`. */
  labelOf?: (ctx: C) => string;
  /** What the heading means, in a line: its tip. */
  hint?: string;
  /** A number or a count sits against the column's right edge, its heading with it. */
  align?: "end";
  /**
   * The table's fill column (Person, Business): pinned at the left edge while the table scrolls sideways, never hidden,
   * and given the room the other columns leave until a member sizes it (widths.ts).
   */
  fill?: boolean;
  /** Holds still at the right edge: never moved, hidden or sized (the row's acts). */
  fixed?: boolean;
  /** Shown until a member turns it off (the default), or off until asked for. */
  on?: boolean;
  /** Declared only where the workspace can show it (Visits needs a calendar). */
  needs?: (ctx: C) => boolean;
  /** Where it starts and its bounds; a column that says nothing is 120px. */
  width?: ColumnWidth;
  /** How it sorts; a column with none does not. */
  sort?: ColumnSort<R>;
  /**
   * A filter's or a sort's own column (the page's narrowings, a tiebreak), never drawn and never in the Columns menu: it
   * holds `filter`, the rows a value of the page's keeps, or a `sort` the page's tiebreak names.
   */
  hidden?: boolean;
  /** Which rows a filter's value keeps (`hidden` columns). */
  filter?: (row: R, value: unknown) => boolean;
  /**
   * What it says in a file of the rows shown: the heading and the cell's words. `headOf` is the file's heading where it
   * is the workspace's word, as `labelOf` is. A column with none is not in the file.
   */
  csv?: { head: string; headOf?: (ctx: C) => string; cell: (row: R) => string };
  /** The cell: its `<td>`, from the row, what the page knows, and (a card's) where the row stands in a selection. */
  cell?: (row: R, ctx: X, pick?: RowPick) => ReactElement<{ className?: string }>;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- a declaration as the kit's own parts read it, whatever its row */
export type AnyDataColumn = DataColumn<any, any, any>;

/** A phone's one cell a row: its heading's words, and the card drawn from the row. */
export interface DataCard<R extends TableRow, X = unknown> {
  label: string;
  cell: (row: R, ctx: X, pick?: RowPick) => ReactElement<{ className?: string }>;
  /** The class the card's row wears (the page's card rules read it). */
  rowClass?: string;
}

/** The narrowest a member may make any column, and the widest. */
export const TABLE_MIN_PX = 56;
export const TABLE_MAX_PX = 1200;
/** A step of the keyboard on a column's edge, and a bigger one with Shift. */
export const TABLE_NUDGE_PX = 16;
export const TABLE_NUDGE_BIG_PX = 64;
/** The select column: a box, held at this width. */
export const TABLE_SELECT_PX = 42;
/** A column that declares nothing is this wide. */
const DEFAULT_BASE_PX = 120;

/**
 * A width as a drag or a key leaves it: whole pixels between the least and the most, the most being wherever the
 * column already stands where that is wider (a column a wide window made wide must not shrink to the limit at the first
 * pixel).
 */
export const clampWidth = (px: number, standing: number = 0): number =>
  Math.min(Math.max(TABLE_MAX_PX, Math.round(standing)), Math.max(TABLE_MIN_PX, Math.round(px)));

/** The most a fit takes a column to: what it holds, never past the most it asks for, nor outside a drag's bounds. */
export const fitWidth = (measured: number, width?: ColumnWidth): number =>
  Math.min(width?.max ?? TABLE_MAX_PX, TABLE_MAX_PX, Math.max(TABLE_MIN_PX, Math.round(measured)));

/** Where a column starts. */
export const baseOf = (c: Pick<AnyDataColumn, "width">): number => c.width?.base ?? DEFAULT_BASE_PX;

/** The fill column's least, while it takes the room the others leave. */
export const fillMinOf = (c: Pick<AnyDataColumn, "width">): number => Math.min(c.width?.min ?? baseOf(c), baseOf(c));

/** Person and the row's acts are not the member's to hide. */
export const isLocked = (c: Pick<AnyDataColumn, "fill" | "fixed">): boolean => !!(c.fill || c.fixed);

/** Whether a member may move the column: not the fill column, not one that holds still, not a hidden one. */
export const isMovable = (c: Pick<AnyDataColumn, "fill" | "fixed" | "hidden">): boolean =>
  !c.fill && !c.fixed && !c.hidden;

/** Whether the column has an edge to size it by: one with words for a heading, that does not hold still. */
export const isSizable = (c: Pick<AnyDataColumn, "fixed" | "hidden" | "label">): boolean =>
  !c.fixed && !c.hidden && typeof c.label === "string";

/**
 * The columns this workspace declares (`needs`), each with its heading, and its file's, in the workspace's words where
 * it has them (labelOf, csv.headOf), else its own.
 */
export function columnsIn<R extends TableRow, X, C>(
  columns: readonly DataColumn<R, X, C>[],
  ctx: C,
): DataColumn<R, X, C>[] {
  return columns
    .filter((c) => !c.needs || c.needs(ctx))
    .map((c) => {
      const headOf = c.csv?.headOf;
      if (!c.labelOf && !headOf) return c;
      return {
        ...c,
        ...(c.labelOf ? { label: c.labelOf(ctx) } : {}),
        ...(c.csv && headOf ? { csv: { ...c.csv, head: headOf(ctx) } } : {}),
      };
    });
}

/** The keys a view may sort by: the columns whose headings sort. */
export const sortKeysOf = (columns: readonly Pick<AnyDataColumn, "key" | "sort" | "hidden">[]): string[] =>
  columns.filter((c) => c.sort && !c.hidden).map((c) => c.key);

/** Which way a first press on a heading goes: the column's own word, else the most first. */
export const firstDirOf = (columns: readonly Pick<AnyDataColumn, "key" | "sort">[], key: string): SortDir =>
  columns.find((c) => c.key === key)?.sort?.first ?? "desc";

/**
 * The order a desk's table stands in: the member's sort while its column shows, else the page's first sort; it comes
 * back with its column. People read "Sorted by next step" over a table with no Next step (27 Oct 2026). The page's first
 * sort stands whether its column shows or not: Leads' is Best fit first, its Fit column off until asked for, and gave
 * way to the first column shown that sorts, so a desk's Leads opened Z to A by name (27 Oct 2026). `shown`: the desk's
 * columns drawn.
 */
export const sortShownOf = <S extends { by: string; dir: SortDir }>(
  shown: readonly Pick<AnyDataColumn, "key" | "sort" | "hidden">[],
  chosen: S,
  first: S,
): S => (chosen.by === first.by || sortKeysOf(shown).includes(chosen.by) ? chosen : first);

/** Whether each column shows before a member chooses: every one that does not say it is off. */
export const visibilityDefaults = (
  columns: readonly Pick<AnyDataColumn, "key" | "on" | "fill" | "fixed" | "hidden">[],
): Record<string, boolean> =>
  Object.fromEntries(columns.map((c) => [c.key, !c.hidden && (isLocked(c) || c.on !== false)]));

/** A saved `columns` value, read with care: only the columns a member may hide, and only true or false. */
export const choicesOf = (
  columns: readonly Pick<AnyDataColumn, "key" | "fill" | "fixed" | "hidden">[],
  raw: unknown,
): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const saved = raw as Record<string, unknown>;
  for (const c of columns) {
    const v = saved[c.key];
    if (!isLocked(c) && !c.hidden && typeof v === "boolean") out[c.key] = v;
  }
  return out;
};

/** Whether each column shows: its default, or the member's choice over it; never a locked or a hidden column's choice. */
export const visibilityOf = (
  columns: readonly Pick<AnyDataColumn, "key" | "on" | "fill" | "fixed" | "hidden">[],
  choices: Readonly<Record<string, boolean>>,
): Record<string, boolean> => ({ ...visibilityDefaults(columns), ...choicesOf(columns, choices) });

/**
 * A member's choices, as the view keeps them: only where one differs from its column's default, so a column put back
 * the way its default has it is no choice any more and follows the default again.
 */
export const choicesFrom = (
  columns: readonly Pick<AnyDataColumn, "key" | "on" | "fill" | "fixed" | "hidden">[],
  visibility: Readonly<Record<string, boolean>>,
): Record<string, boolean> => {
  const defaults = visibilityDefaults(columns);
  const out: Record<string, boolean> = {};
  for (const c of columns) {
    const v = visibility[c.key];
    if (!isLocked(c) && !c.hidden && typeof v === "boolean" && v !== defaults[c.key]) out[c.key] = v;
  }
  return out;
};

/** A saved order, read with care: the keys of columns a member may move, once each. */
export const orderOf = (columns: readonly Pick<AnyDataColumn, "key" | "fill" | "fixed" | "hidden">[], raw: unknown) => {
  const known = new Set(columns.filter(isMovable).map((c) => c.key));
  const order: string[] = [];
  if (Array.isArray(raw))
    for (const k of raw) if (typeof k === "string" && known.has(k) && !order.includes(k)) order.push(k);
  return order;
};

/** Saved widths, read with care: of columns that can be sized, finite, in a drag's bounds, in whole pixels. */
export const widthsOf = (columns: readonly Pick<AnyDataColumn, "key" | "fixed" | "hidden">[], raw: unknown) => {
  const widths: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return widths;
  for (const c of columns) {
    const v = (raw as Record<string, unknown>)[c.key];
    if (!c.fixed && !c.hidden && typeof v === "number" && Number.isFinite(v))
      widths[c.key] = Math.min(TABLE_MAX_PX, Math.max(TABLE_MIN_PX, Math.round(v)));
  }
  return widths;
};

/** A saved row height, read with care. */
export const densityOf = (raw: unknown): Density => (raw === "compact" ? "compact" : "comfortable");

/** The columns in a member's order: the fill column first, the keys they put in order, the rest as declared, the fixed last. */
export function orderedColumns<C extends Pick<AnyDataColumn, "key" | "fill" | "fixed">>(
  columns: readonly C[],
  order: readonly string[],
): C[] {
  const rank = new Map(order.map((k, i) => [k, i]));
  const place = (c: C): number => (c.fill ? -1 : c.fixed ? Infinity : (rank.get(c.key) ?? order.length));
  return columns
    .map((c, i) => ({ c, i }))
    .sort((a, b) => place(a.c) - place(b.c) || a.i - b.i)
    .map((x) => x.c);
}

/** The columns a member may move, as they stand now: their order, over the keys of those drawn. */
const standing = (order: readonly string[], movable: readonly string[]): string[] =>
  orderedColumns(
    movable.map((k) => ({ key: k })),
    order,
  ).map((c) => c.key);

/** The order with `key` one place earlier (`-1`) or later (`1`) among the columns a member may move: unchanged at an end. */
export function movedBy(order: readonly string[], movable: readonly string[], key: string, by: -1 | 1): string[] {
  const now = standing(order, movable);
  const at = now.indexOf(key);
  const to = at + by;
  if (at < 0 || to < 0 || to >= now.length) return [...order];
  const next = [...now];
  const here = next[at];
  const there = next[to];
  if (here === undefined || there === undefined) return [...order];
  next[at] = there;
  next[to] = here;
  return next;
}

/** The order with `key` where `target` stands: before it when it came from the right, after it when from the left. */
export function movedTo(order: readonly string[], movable: readonly string[], key: string, target: string): string[] {
  const now = standing(order, movable);
  const from = now.indexOf(key);
  const to = now.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = now.filter((k) => k !== key);
  next.splice(to, 0, key);
  return next;
}

/**
 * An order changed: the columns a member may move that are drawn, in their new places, then the others as they stood,
 * so a column turned off and on again comes back to the place it had. Null where nothing moved (a column at the end of
 * its row): no change to the view, and the workspace's copy is kept.
 */
export const reordered = (order: readonly string[], next: readonly string[]): string[] | null =>
  next.length === order.length && next.every((k, i) => k === order[i])
    ? null
    : [...next, ...order.filter((k) => !next.includes(k))];

/** A row of the Columns menu: the column's key, its heading's words, whether it shows, and whether it always does. */
export interface ColumnOption {
  key: string;
  label: string;
  on: boolean;
  locked: boolean;
}

/**
 * The Columns menu's rows: every column this workspace declares, whether it shows, and the fill column, which always
 * does. A switch is named by its words, which typing finds, so a column headed by no words (the Pipeline's chip and
 * acts, a screen reader's alone) is not one, and each such column is fixed as well.
 */
export const columnOptionsOf = (
  columns: readonly AnyDataColumn[],
  visibility: Readonly<Record<string, boolean>>,
): ColumnOption[] =>
  columns.flatMap((c) =>
    !c.fixed && !c.hidden && typeof c.label === "string"
      ? [{ key: c.key, label: c.label, on: !!c.fill || visibility[c.key] !== false, locked: !!c.fill }]
      : [],
  );

/** The columns a desk draws: those that show, in the member's order. */
export const shownColumnsOf = <C extends AnyDataColumn>(
  columns: readonly C[],
  visibility: Readonly<Record<string, boolean>>,
  order: readonly string[],
): C[] =>
  orderedColumns(
    columns.filter((c) => !c.hidden && (isLocked(c) || visibility[c.key] !== false)),
    order,
  );
