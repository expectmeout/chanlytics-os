/**
 * How wide a desk's table and its columns stand (decision 0083, §6.1): each column at its own size, or the member's,
 * and two ways the table takes its box.
 *
 * - **fill**: nobody has sized the fill column (Person, Business). The table is its box's width and the fill column
 *   takes whatever room the others leave, never less than its least, past which the table scrolls sideways.
 * - **sized**: a member has. The table is the sum of its columns, wider than its box (it scrolls) or narrower (room after
 *   the last column), as a spreadsheet's is, and no column moves because of another or of the box. One exception: the
 *   fill column, wider than PIN_SHARE of the box while the table scrolls, gives way to it, so the columns it is pinned
 *   over can always be reached (a Person saved at 979px stood over the whole of an 888px box). What a member saved is
 *   kept; this only draws it.
 *
 * The share-of-spare-room model this replaces (every column growing by a share, the first drag freezing all of them)
 * is gone: it was rebuilt three times. Widths are written to the table's `<col>`s and its attributes as the sizing atom
 * moves (`writeWidths`), never through React, so a drag draws no row.
 */
import { TABLE_MAX_PX, TABLE_SELECT_PX, baseOf, fillMinOf, type AnyDataColumn } from "./columns";

/** How the table takes its box. */
export type Sizing = "fill" | "sized";

/** The most of the box a fill column keeps while the table scrolls under it. */
const PIN_SHARE = 0.45;

/** Every drawn column's width (null: the fill column taking the room left), how the table is sized, and its sums. */
export interface DrawnWidths {
  widths: (number | null)[];
  sizing: Sizing;
  /** Sized: the table's width. Fill: its least, the others' widths and the fill column's least. */
  total: number;
}

/**
 * The widths a desk draws: the columns in the order drawn, the member's widths, the box's width (null before it is
 * measured), and whether the select column stands first.
 */
export function drawnWidths(
  columns: readonly Pick<AnyDataColumn, "key" | "fill" | "width">[],
  sizing: Readonly<Record<string, number>>,
  box: number | null,
  selectable: boolean,
): DrawnWidths {
  const sel = selectable ? TABLE_SELECT_PX : 0;
  const fillAt = columns.findIndex((c) => c.fill);
  const fill = columns[fillAt];
  const widthOf = (c: Pick<AnyDataColumn, "key" | "width">): number => sizing[c.key] ?? baseOf(c);
  if (fill && sizing[fill.key] === undefined) {
    const widths = columns.map((c, i) => (i === fillAt ? null : widthOf(c)));
    const others = widths.reduce<number>((sum, w) => sum + (w ?? 0), 0);
    return { widths, sizing: "fill", total: sel + others + fillMinOf(fill) };
  }
  const widths: (number | null)[] = columns.map(widthOf);
  const sum = (): number => sel + widths.reduce<number>((s, w) => s + (w ?? 0), 0);
  const pinned = fill ? widths[fillAt] : undefined;
  if (fill && typeof pinned === "number" && box !== null && box > 0) {
    const over = sum() - Math.round(box);
    // It gives way only as far as the table then fits, and never under its share of the box nor its own least.
    const floor = Math.min(pinned, Math.max(fillMinOf(fill), Math.round(box * PIN_SHARE)));
    if (over > 0) widths[fillAt] = Math.max(floor, pinned - over);
  }
  return { widths, sizing: "sized", total: sum() };
}

/** Whether the box can be scrolled further right, said on the box (`data-more`), so its right edge draws a line. */
export const markMore = (el: HTMLElement): void => {
  el.toggleAttribute("data-more", el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
};

/**
 * The widths, written: each `<col>` its width (the fill column's none while it fills), the table how it is sized
 * (`data-sizing`; its width once sized, `--tbl-width`, and its least while it fills, `--tbl-min`, both read by the
 * stylesheet: a width attribute is outranked by its `width: 100%`, and a sized table short of its box spread the room
 * over every column a member had sized), and each edge the width it stands at, as its slider says it.
 */
export function writeWidths(table: HTMLTableElement, columns: readonly AnyDataColumn[], drawn: DrawnWidths): void {
  table.setAttribute("data-sizing", drawn.sizing);
  if (drawn.sizing === "sized") {
    table.style.setProperty("--tbl-width", `${drawn.total}px`);
    table.style.removeProperty("--tbl-min");
  } else {
    table.style.removeProperty("--tbl-width");
    table.style.setProperty("--tbl-min", `${drawn.total}px`);
  }
  const cols = table.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col[data-col]");
  cols.forEach((col) => {
    const at = columns.findIndex((c) => c.key === col.getAttribute("data-col"));
    const w = at < 0 ? null : drawn.widths[at];
    if (typeof w === "number") col.setAttribute("width", String(w));
    else col.removeAttribute("width");
  });
  table.querySelectorAll<HTMLElement>(":scope > thead [data-edge]").forEach((edge) => {
    const th = edge.closest("th");
    if (!th) return;
    const w = Math.round(th.getBoundingClientRect().width);
    edge.setAttribute("aria-valuenow", String(w));
    edge.setAttribute("aria-valuemax", String(Math.max(TABLE_MAX_PX, w)));
  });
  const box = table.parentElement;
  if (box) markMore(box);
}
