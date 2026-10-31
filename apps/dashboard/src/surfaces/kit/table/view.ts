/**
 * A table's saved view (decision 0083, §7): what a member chose of a list's sort, columns, widths, order and row height,
 * kept per scope in the workspace (memberships.views, through member_view_set, 00113) and on this device. Its shape on
 * the wire is the one the engine before this one wrote, key for key and in the same order, so an old tab and a new one
 * read and write each other's views and a revert loses nobody's:
 *
 *   { list?, sortBy, sortDir, columns, widths?, order?, density?, ...extra }
 *
 * `list` is Leads' rail row, `extra` a page's own keys (the Pipeline's `{ layout }`). A key is written only where it
 * says something: `columns` holds the choices that differ from each column's default, `widths` only where one was set,
 * `order` only once a column moved, `density` only when compact. So a view nobody changed stays as small as it always
 * was, under the route's 2,000 characters.
 *
 * `fromView` and `toView` are the two directions, pure; `viewKey` is what is compared to know whether a save says
 * anything new.
 */
import {
  choicesFrom,
  choicesOf,
  densityOf,
  orderOf,
  sortKeysOf,
  visibilityOf,
  widthsOf,
  type AnyDataColumn,
  type Density,
  type SortDir,
} from "./columns";

/** A saved view, as the wire has it. */
export type View = Record<string, unknown>;

/** What a view says, read with care. */
export interface ViewParts {
  by: string;
  dir: SortDir;
  /** The member's choices of which columns show, over each column's default. */
  columns: Record<string, boolean>;
  widths: Record<string, number>;
  order: string[];
  density: Density;
  /** The page's own keys, each its default's type or its default. */
  extra: View | null;
}

/** A page's own keys in its view, read with care: a value of another type than its default's is not a choice. */
export const extraOf = (raw: View | null, defaults: View | null | undefined): View | null => {
  if (!defaults) return null;
  const out: View = {};
  for (const k of Object.keys(defaults)) out[k] = raw && typeof raw[k] === typeof defaults[k] ? raw[k] : defaults[k];
  return out;
};

/**
 * A view, read with care against the page's columns (every one it declares, whatever the workspace shows): a sort by a
 * column this page cannot sort falls back to the page's first, its direction kept; choices only of columns a member may
 * hide, and only where one differs from its column's default (one the way its default has it is no choice, and the next
 * save leaves it out); widths of columns that can be sized, in bounds; an order of columns that exist; a row height.
 */
export function fromView(
  raw: View | null | undefined,
  columns: readonly AnyDataColumn[],
  first: { by: string; dir: SortDir },
  extraDefaults?: View | null,
): ViewParts {
  const v = raw ?? {};
  const by = typeof v.sortBy === "string" && sortKeysOf(columns).includes(v.sortBy) ? v.sortBy : first.by;
  const dir: SortDir = v.sortDir === "asc" || v.sortDir === "desc" ? v.sortDir : first.dir;
  return {
    by,
    dir,
    columns: choicesFrom(columns, visibilityOf(columns, choicesOf(columns, v.columns))),
    widths: widthsOf(columns, v.widths),
    order: orderOf(columns, v.order),
    density: densityOf(v.density),
    extra: extraOf(v, extraDefaults),
  };
}

/**
 * The view as the wire keeps it. `row`: Leads' rail row, which its view carries first (`undefined` for a scope whose
 * view has none).
 */
export function toView(p: ViewParts, row?: string | null): View {
  return {
    ...(row !== undefined ? { list: row } : {}),
    sortBy: p.by,
    sortDir: p.dir,
    columns: p.columns,
    ...(Object.keys(p.widths).length ? { widths: p.widths } : {}),
    ...(p.order.length ? { order: p.order } : {}),
    ...(p.density === "compact" ? { density: p.density } : {}),
    ...(p.extra || {}),
  };
}

/** What a save is compared by: the view's words, in its keys' order. */
export const viewKey = (v: View): string => JSON.stringify(v);

/** Where a scope's view is kept: this device's copy, and the workspace's, saved one at a time. */
export interface ViewStore {
  /** This device's copy, `{}` where none was kept or storage refuses. */
  load: (scope: string) => View;
  save: (scope: string, view: View) => void;
  /** One saver for the page's life: its saves go one at a time, the latest waiting. */
  saver: (scope: string) => (view: View) => void;
}
