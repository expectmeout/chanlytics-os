/**
 * A table's rows (moved from people/table/table.tsx, decision 0083): one row, drawn again only when something of its own
 * changed, and the body that draws the rows on screen and a few either side (kit/rows/shown-rows.ts), the cursor's row
 * always among them. A row is memoised on what it is (its row, its id, whether it is selected, the cursor, the columns
 * drawn, the cell context), never on table-core's row object, which the row model makes anew.
 *
 * A cell draws its own `<td>`; the row marks on it the column it is (`data-col`) and, for the fill column, that it is
 * pinned at the left edge (`data-pin`), so where a column stands is the kit's in one place.
 */
import { cloneElement, memo } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { warmsOnReach } from "../../legacy-verbs";
import { EmptyState } from "../empty/empty";
import type { AnyDataColumn, DataCard, RowPick, TableRow } from "./columns";
import type { TableNouns } from "./head";

/** What a cell reaches through the table: a pointer resting on a row warms its read. */
interface WarmCtx {
  onWarm?: (id: string) => void;
}

/** Words the member selected in a row (a number they mean to copy): a drag that ends on the row is not a press on it. */
const pickedWords = (row: Element | null | undefined): boolean => {
  const s = typeof window !== "undefined" && window.getSelection ? window.getSelection() : null;
  return !!s && !s.isCollapsed && s.toString().trim() !== "" && !!row && !!s.anchorNode && row.contains(s.anchorNode);
};

/** A cell, marked with its column, and pinned where it is the fill column (the left edge) or the row's acts (the right). */
const placed = (td: ReactElement<{ className?: string }>, c: AnyDataColumn, pinEnd: string | null) =>
  cloneElement(td as ReactElement<Record<string, unknown>>, {
    key: c.key,
    "data-col": c.key,
    ...(c.fill ? { "data-pin": "start" } : c.key === pinEnd ? { "data-pin": "end" } : {}),
  });

export interface RowProps<R extends TableRow, X> {
  row: R;
  /** Where the row stands in the list, and what measures it once drawn (kit/rows/shown-rows.ts). */
  index: number;
  measure: (el: Element | null) => void;
  /** Its row among the table's, heads included, where the table draws only some of them (`aria-rowindex`). */
  rowIndex?: number;
  columns: readonly AnyDataColumn[];
  /** A phone's card: one cell a row, whatever the desk's columns. */
  card: DataCard<R, X> | null;
  ctx: X;
  words: TableNouns;
  selectable: boolean;
  selected: boolean;
  /** A selection is under way (somebody is picked, or the page began one): a card's face is then its checkbox. */
  selecting: boolean;
  focused: boolean;
  tabStop: boolean;
  /** The row's box changed, with the event (Shift selects the range from the last one picked). */
  onToggle: (id: string, e?: ChangeEvent<HTMLInputElement>) => void;
  onCursor: (id: string) => void;
  onOpen: (id: string) => void;
  rowClass: ((row: R) => string) | null;
  /** The column held at the right edge (the row's acts), where there is one. */
  pinEnd: string | null;
}

function TableRowView<R extends TableRow, X>(p: RowProps<R, X>) {
  const { row, ctx, words, selectable, selected, selecting, focused, card } = p;
  const warm = (ctx as WarmCtx | null)?.onWarm;
  // What a card's face says of the selection: a ring while one is under way, the ink with its tick for this one in it.
  const pick: RowPick = selected ? "chosen" : selecting ? "choose" : undefined;
  const own = [card?.rowClass, p.rowClass ? p.rowClass(row) : ""].filter(Boolean).join(" ");
  return (
    <tr
      ref={p.measure}
      data-index={p.index}
      aria-rowindex={p.rowIndex}
      id={`${words.id ?? words.one}-${row.id}`}
      className={`${selected ? "selected" : ""} ${focused ? "focused" : ""} ${own}`}
      aria-selected={selectable ? selected : undefined}
      data-card={card ? "" : undefined}
      tabIndex={p.tabStop ? 0 : -1}
      onFocus={() => {
        if (warm) warm(row.id);
        if (!focused) p.onCursor(row.id);
      }}
      // A pointer that rests on the row warms it, never a finger (legacy-verbs warmsOnReach).
      onPointerEnter={warm ? (e) => warmsOnReach(e) && warm(row.id) : undefined}
      onClick={(e) => {
        // The words selected are this row's own (a drag across a number to copy it); the page's other words are not.
        if (!pickedWords(e && e.currentTarget)) p.onOpen(row.id);
      }}
    >
      {selectable && (
        <td className="dtable-sel" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="dtable-check"
            checked={selected}
            onChange={(e) => p.onToggle(row.id, e)}
            aria-label={`Select ${row.name}`}
            data-testid="row-select"
          />
        </td>
      )}
      {card
        ? card.cell(row, ctx, pick)
        : p.columns.map((c) => (c.cell ? placed(c.cell(row, ctx, pick), c, p.pinEnd) : null))}
    </tr>
  );
}

/** One row, drawn again only when a prop of its own changed. React.memo is not a hook: the tests' stub React draws it. */
export const TableRowMemo = memo(TableRowView) as typeof TableRowView;

/** Nobody to show: the page's own words where it has them, else whether the list is empty or the view finds nobody. */
export interface TableEmpty {
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void } | null;
}

/** The empty row: one cell across every column. */
export const emptyRow = (p: {
  span: number;
  empty: TableEmpty | null;
  total: number;
  filtered: boolean;
  onClearFilters: () => void;
}) => (
  <tr>
    <td colSpan={p.span} className="dtable-empty">
      <EmptyState
        kind="line"
        className="empty-center"
        glyph="search"
        title={
          p.empty ? p.empty.title : p.total === 0 ? "Nobody has written or phoned yet." : "No one matches this view."
        }
        body={p.empty ? p.empty.body : undefined}
        action={
          p.empty
            ? p.empty.action
            : p.total > 0 && p.filtered
              ? { label: "Clear filters", onClick: p.onClearFilters }
              : null
        }
      />
    </td>
  </tr>
);
