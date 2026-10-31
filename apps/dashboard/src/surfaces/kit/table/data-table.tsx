/**
 * The kit's table (decision 0083): every operational list of the app draws its rows through it, People, Leads and the
 * Pipeline's list. Its state is table-core's, in the atoms the page made (state.ts); the rows are the table's row model
 * (use-data-table.ts), or a page's groups (groups.tsx) in the order the page gives them. It draws the box that scrolls,
 * the heading row (head.tsx), the rows (rows.tsx), a phone's cards in the same `<table>` so the card rules hold, the
 * empty row and the foot; on a desk, the widths (widths.ts), written as the sizing atom moves.
 *
 * A long list draws the rows on screen and a few either side (kit/rows/shown-rows.ts), the cursor's row always among
 * them. The rows rise in as the table arrives (kit/motion/use-rows-arrive.ts) and swap as the view under it changes (the
 * page's swap motion, over `TABLE_BODIES`); `busy` dims the rows, never the heads.
 */
import { useCallback, useLayoutEffect, useRef } from "react";
import type { ChangeEvent, ReactElement, RefObject, UIEvent } from "react";
import { useRowsArrive } from "../motion/use-rows-arrive";
import { RowGap } from "../rows/row-gap";
import { useShownRows, type ShownRows } from "../rows/shown-rows";
import {
  fitWidth,
  isMovable,
  isSizable,
  movedBy,
  movedTo,
  TABLE_SELECT_PX,
  type AnyDataColumn,
  type DataCard,
  type DataColumn,
  type SortDir,
  type TableRow,
} from "./columns";
import { fitWidthOf } from "./edge";
import { sectionBodies, type TableSection } from "./groups";
import { tableHead, type HeadActs, type TableNouns } from "./head";
import { TableRowMemo, emptyRow, type TableEmpty } from "./rows";
import type { TableState } from "./state";
import type { DataTableModel } from "./use-data-table";
import { drawnWidths, markMore, writeWidths } from "./widths";

/** What of the table rises on a swap (kit/motion use-swap-motion.ts `parts`): its row groups, never its heads. */
export const TABLE_BODIES = ":scope > tbody";

const PERSON_NOUN: TableNouns = { one: "person", many: "people", all: "Select everyone shown", list: "People" };
const NOUNS: Record<string, TableNouns> = {
  person: PERSON_NOUN,
  // The Pipeline's rows are deals (0029: a row per open deal), counted as deals at the foot; each row's element is still
  // named for its person's row (`person-<row>`), which the Pipeline's focus and its board look up (Ruben, 10 Oct 2026).
  deal: { one: "deal", many: "deals", all: "Select every deal shown", list: "Deals", id: "person" },
  lead: { one: "lead", many: "leads", all: "Select every lead shown", list: "Leads" },
};

/** A row's height before it is measured: a phone's card, else a desk's row at its density. */
const rowHeightOf = (desk: boolean, compact: boolean): number => (!desk ? 84 : compact ? 37 : 49);

const NO_SEL: ReadonlySet<string> = new Set();
/** A phone's columns: none, the same list on every draw, so a memoised card is not drawn again for it. */
const NO_COLUMNS: readonly AnyDataColumn[] = [];
const NOOP = (): void => undefined;

export interface DataTableProps<R extends TableRow, X> {
  /** The table (use-data-table.ts) and the rows it shows, in their order. */
  table: DataTableModel<R>;
  rows: readonly R[];
  state: TableState;
  /** The columns a desk draws, in the member's order (columns.ts `shownColumnsOf`). */
  columns: readonly DataColumn<R, X, never>[] | readonly AnyDataColumn[];
  /** A phone's card, drawn for each row in place of the columns; a desk draws none. */
  card?: DataCard<R, X> | null;
  ctx: X;
  /** How many the view holds, said at the foot. */
  total: number;
  /** Whether the view or a narrowing leaves any of them out: the foot says "Showing N of M", the empty row offers a way back. */
  filtered: boolean;
  onClearFilters: () => void;
  /** The sort drawn on the headings (the member's, where its column shows). */
  sortBy: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
  onOpen: (id: string) => void;
  selectable?: boolean;
  onToggleAll?: () => void;
  cursor?: string | null;
  onCursor?: (id: string) => void;
  empty?: TableEmpty | null;
  noun?: string;
  rowClass?: ((row: R) => string) | null;
  busy?: boolean;
  /** A selection begun with nobody picked yet (a phone's Select people). */
  selectMode?: boolean;
  /** The rows in groups (the Pipeline's stages), each drawn whole. */
  sections?: readonly TableSection<R>[] | null;
  /** The table's element, for the page's swap motion. */
  swapRef?: RefObject<HTMLTableElement | null> | null;
  /**
   * The page's own classes beside the kit's, on the box, the scroller and the table: what its stylesheet places them by
   * and draws its own cells under (a class of the page's, never a kit's).
   */
  classNames?: { wrap?: string; scroll?: string; table?: string };
  /** How the groups' heads are drawn: as the Pipeline's stages (a name in the semibold, its meta giving way), or plainly. */
  groups?: "stages" | null;
}

/** Classes joined, the empty ones left out. */
const joined = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");

/** What a column's cells say, row by row, for a fit to measure every row and not only those drawn: its file words. */
const textsOf = <R extends TableRow>(c: AnyDataColumn, rows: readonly R[]): string[] | null =>
  c.csv ? rows.map((r) => c.csv?.cell(r) ?? "") : null;

/** A column fitted to what it holds, never past the most it asks for. */
const fitOf = <R extends TableRow>(th: HTMLElement, c: AnyDataColumn, rows: readonly R[]): number =>
  fitWidth(fitWidthOf(th, textsOf(c, rows)), c.width);

/**
 * The heading's acts on widths and places, over the state: a drag's start, its live width and its end, a reset, a fit,
 * a move. Made each draw from this draw's columns and rows.
 */
function headActs<R extends TableRow>(
  state: TableState,
  columns: readonly AnyDataColumn[],
  rows: readonly R[],
): HeadActs {
  const movable = columns.filter(isMovable).map((c) => c.key);
  return {
    start: (key) => state.startSizing(key),
    size: (key, px, commit) => state.sizeColumn(key, px, commit),
    cancel: () => state.cancelSizing(),
    reset: (key) => state.resetWidth(key),
    fit: (key, th) => {
      const c = columns.find((x) => x.key === key);
      if (c) state.sizeColumn(key, fitOf(th, c, rows), true);
    },
    move: (key, by) => state.moveColumns(movedBy(state.atoms.columnOrder.get(), movable, key, by)),
    moveTo: (key, target) => state.moveColumns(movedTo(state.atoms.columnOrder.get(), movable, key, target)),
  };
}

/**
 * What Fit all columns asks of the table: each column it can size, fitted to every row it holds. Left on the state as
 * the table draws, so it measures the rows and columns drawn last.
 */
function leaveMeasure<R extends TableRow>(state: TableState, columns: readonly AnyDataColumn[], rows: readonly R[]) {
  state.dom.measure = (table) => {
    const fits: Record<string, number> = {};
    for (const c of columns) {
      const th = isSizable(c) ? table.querySelector<HTMLElement>(`thead th[data-key="${c.key}"]`) : null;
      if (th) fits[c.key] = fitOf(th, c, rows);
    }
    return fits;
  };
}

/** What the desk's widths are written from: the state's sizing, the table's element, the columns drawn. */
interface DeskWidths {
  state: TableState;
  el: RefObject<HTMLTableElement | null>;
  columns: readonly AnyDataColumn[];
  desk: boolean;
  selectable: boolean;
}

/**
 * The desk's widths, written as they move: once as the table is drawn with these columns, again as the sizing atom
 * moves (a drag, a key, a fit) and as the box changes width. None on a phone, whose cards have no columns.
 */
function useDeskWidths({ state, el, columns, desk, selectable }: DeskWidths) {
  const drawn = useRef(columns);
  drawn.current = columns;
  const key = columns.map((c) => c.key).join(",");
  useLayoutEffect(() => {
    const table = el.current;
    if (!desk || !table) return undefined;
    const box = table.parentElement;
    const write = () =>
      writeWidths(
        table,
        drawn.current,
        drawnWidths(drawn.current, state.atoms.columnSizing.get(), box ? box.clientWidth : null, selectable),
      );
    write();
    const sub = state.atoms.columnSizing.subscribe(write);
    const watching = typeof ResizeObserver === "function" && box ? new ResizeObserver(write) : null;
    if (watching && box) watching.observe(box);
    return () => {
      sub.unsubscribe();
      if (watching) watching.disconnect();
    };
  }, [desk, selectable, key]); // eslint-disable-line react-hooks/exhaustive-deps -- the state and the element are the page's for its life
}

/**
 * The elements the table hands out as they are drawn: the scroller to the state (the page's keys scroll it), the table to
 * its arrival and to the page's swap, and on a desk to its widths.
 */
function useTableElements(
  state: TableState,
  swapRef: RefObject<HTMLTableElement | null> | null,
  sizing: Pick<DeskWidths, "columns" | "desk" | "selectable">,
) {
  const el = useRef<HTMLTableElement | null>(null);
  const scrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      state.dom.scroll = node;
    },
    [state.dom],
  );
  // The first rows rise in as the table arrives, as the Inbox's do; one element for that and the page's swap.
  const arrive = useRowsArrive<HTMLTableElement>();
  const tableRef = useCallback(
    (node: HTMLTableElement | null) => {
      el.current = node;
      arrive(node);
      if (swapRef) swapRef.current = node;
    },
    [arrive, swapRef],
  );
  useDeskWidths({ state, el, ...sizing });
  return { scrollRef, tableRef };
}

/** A row of the table's model, or none where it holds no row by that id. */
function rowIn<R extends TableRow>(table: DataTableModel<R>, id: string) {
  try {
    return table.getRow(id, true);
  } catch {
    return null;
  }
}

/** A row's box: table-core's own handler, which selects the range from the last one picked under Shift. */
function useRowToggle<R extends TableRow>(table: DataTableModel<R>, state: TableState) {
  return useCallback(
    (id: string, e?: ChangeEvent<HTMLInputElement>) => {
      const row = rowIn(table, id);
      // A press with no event of its own (a key, a test) is a plain toggle.
      if (row && e && e.target) row.getToggleSelectedHandler()(e);
      else state.toggleSelected(id);
    },
    [table, state.toggleSelected], // eslint-disable-line react-hooks/exhaustive-deps -- the table and its atoms are the page's for its life
  );
}

/** The box says it has scrolled sideways on itself, as it scrolls, and whether more lies past its right edge. */
const onTableScroll = (e: UIEvent<HTMLDivElement>) => {
  e.currentTarget.toggleAttribute("data-scrolled", e.currentTarget.scrollLeft > 0);
  markMore(e.currentTarget);
};

/** The row the window keeps drawn whatever is scrolled to: the cursor's, else the first. */
const keptRows = <R extends TableRow>(rows: readonly R[], cursor: string | null): number[] => {
  const at = cursor === null ? -1 : rows.findIndex((r) => r.id === cursor);
  return [at >= 0 ? at : 0];
};

/** What the table takes from its props for a draw: the shape it takes and what each row is drawn with. */
interface TableShape<R extends TableRow, X> {
  card: DataCard<R, X> | null;
  /** A desk draws the columns; a phone, one card a row. */
  desk: boolean;
  selectable: boolean;
  columns: readonly AnyDataColumn[];
  sections: readonly TableSection<R>[] | null;
  words: TableNouns;
  sel: ReadonlySet<string>;
  /** How many cells a row is across: the columns, or the card, and the box. */
  span: number;
  /** The row's acts hold at the right edge: the last column, where it holds still. */
  pinEnd: string | null;
  cursor: string | null;
}

function tableShape<R extends TableRow, X>(p: DataTableProps<R, X>): TableShape<R, X> {
  const card = p.card ?? null;
  const desk = !card;
  const selectable = p.selectable ?? false;
  const columns = (desk ? p.columns : NO_COLUMNS) as readonly AnyDataColumn[];
  const last = columns[columns.length - 1];
  return {
    card,
    desk,
    selectable,
    columns,
    sections: p.sections ?? null,
    words: NOUNS[p.noun ?? "person"] ?? PERSON_NOUN,
    sel: selectable ? p.state.selected : NO_SEL,
    span: (desk ? columns.length : 1) + (selectable ? 1 : 0),
    pinEnd: last && last.fixed ? last.key : null,
    cursor: p.cursor ?? null,
  };
}

/** Each row's drawing: one memoised row, with what it is drawn with this draw. */
function rowDrawer<R extends TableRow, X>(
  p: DataTableProps<R, X>,
  s: TableShape<R, X>,
  parts: {
    measure: (el: Element | null) => void;
    toggle: (id: string, e?: ChangeEvent<HTMLInputElement>) => void;
    selecting: boolean;
  },
) {
  const onCursor = p.onCursor ?? NOOP;
  const rowClass = s.desk ? (p.rowClass ?? null) : null;
  return (r: R, i: number, rowIndex?: number): ReactElement => (
    <TableRowMemo
      key={r.id}
      row={r}
      index={i}
      measure={parts.measure}
      rowIndex={rowIndex}
      columns={s.columns}
      card={s.card}
      ctx={p.ctx}
      words={s.words}
      selectable={s.selectable}
      selected={s.sel.has(r.id)}
      selecting={parts.selecting}
      focused={s.cursor === r.id}
      tabStop={s.cursor === r.id || (!s.cursor && i === 0)}
      onToggle={parts.toggle}
      onCursor={onCursor}
      onOpen={p.onOpen}
      rowClass={rowClass}
      pinEnd={s.pinEnd}
    />
  );
}

/**
 * What the table says on its element: its name, how many rows it has where it draws only some of them (the heads are
 * row 1), and the marks its rules read (a desk's fixed layout and density, its groups and their kind).
 */
const tableMarks = <R extends TableRow, X>(p: DataTableProps<R, X>, s: TableShape<R, X>, indexed: boolean) => ({
  "aria-label": s.words.list,
  "aria-rowcount": indexed ? p.rows.length + 1 : undefined,
  "data-fixed": s.desk ? "true" : undefined,
  "data-density": s.desk ? p.state.density : undefined,
  "data-grouped": s.sections ? "true" : undefined,
  "data-groups": p.groups ?? undefined,
});

/** A desk's widths: a col for the box, and one for each column drawn, which the widths are written on. */
const colsOf = <R extends TableRow, X>(s: TableShape<R, X>) => (
  <colgroup>
    {s.selectable && <col width={TABLE_SELECT_PX} />}
    {s.columns.map((c) => (
      <col key={c.key} data-col={c.key} />
    ))}
  </colgroup>
);

/** The heading row: the columns on a desk, or the card's one heading on a phone. */
const headOf = <R extends TableRow, X>(
  p: DataTableProps<R, X>,
  s: TableShape<R, X>,
  picked: number,
  indexed: boolean,
) =>
  tableHead({
    words: s.words,
    columns: s.desk ? s.columns : [{ key: "card", label: s.card?.label ?? "", fill: true }],
    selectable: s.selectable,
    picked,
    shown: p.rows.length,
    onToggleAll: p.onToggleAll ?? NOOP,
    sortBy: p.sortBy,
    sortDir: p.sortDir,
    onSort: p.onSort,
    acts: s.desk ? headActs(p.state, s.columns, p.rows) : null,
    pinEnd: s.pinEnd,
    indexed,
  });

/** One body of rows: those the window draws, a gap row for the room of those it does not, and the empty row for none. */
function oneBody<R extends TableRow, X>(
  p: DataTableProps<R, X>,
  s: TableShape<R, X>,
  shown: ShownRows,
  rowOf: (r: R, i: number, rowIndex?: number) => ReactElement,
) {
  return (
    <tbody data-dims ref={shown.listRef}>
      {/* The cursor's row is the table's one tab stop (the first row until there is a cursor), and a row focused -- by
          Tab, or by a click -- takes the cursor, so what a screen reader hears and what the keys act on agree. */}
      {shown.parts.map((part) => {
        if (part.kind === "gap")
          return <RowGap key={part.key} height={part.height} span={s.span} className="dtable-gap" />;
        const r = p.rows[part.index];
        return r ? rowOf(r, part.index, part.index + 2) : null;
      })}
      {p.rows.length === 0 &&
        emptyRow({
          span: s.span,
          empty: p.empty ?? null,
          total: p.total,
          filtered: p.filtered,
          onClearFilters: p.onClearFilters,
        })}
    </tbody>
  );
}

/** What the foot says: how many, or how many of how many the view or a narrowing shows. */
const footWords = <R extends TableRow, X>(p: DataTableProps<R, X>, words: TableNouns): string =>
  p.filtered ? `Showing ${p.rows.length} of ${p.total}` : `${p.total} ${p.total === 1 ? words.one : words.many}`;

/** The table, for any rows. */
export function DataTable<R extends TableRow, X>(p: DataTableProps<R, X>) {
  const { table, state, rows } = p;
  const s = tableShape(p);
  const { scrollRef, tableRef } = useTableElements(state, p.swapRef ?? null, s);
  if (s.desk) leaveMeasure(state, s.columns, rows);
  const toggle = useRowToggle(table, state);
  const picked = rows.filter((r) => s.sel.has(r.id)).length;
  const selecting = !!p.selectMode || picked > 0;
  const shown = useShownRows({
    count: s.sections ? 0 : rows.length,
    estimate: rowHeightOf(s.desk, state.density === "compact"),
    keyOf: (i) => rows[i]?.id ?? String(i),
    keep: keptRows(rows, s.cursor),
  });
  const rowOf = rowDrawer(p, s, { measure: shown.measure, toggle, selecting });
  // One body drawn in part says how many rows it has and where each drawn one stands, so a screen reader counts the list
  // and not the screen of it drawn. The Pipeline's sections draw every row, and say nothing more.
  const sectioned = !!s.sections && s.sections.some((x) => x.rows.length > 0);
  const indexed = !sectioned && rows.length > 0;
  return (
    <div
      className={joined("dtable-wrap", p.classNames?.wrap, selecting && "selecting")}
      data-density={s.desk ? state.density : undefined}
    >
      <div
        ref={scrollRef}
        className={joined("dtable-scroll", p.classNames?.scroll)}
        onScroll={onTableScroll}
        aria-busy={p.busy ? "true" : undefined}
        data-testid="people-table-scroll"
      >
        <table className={joined("dtable", p.classNames?.table)} ref={tableRef} {...tableMarks(p, s, indexed)}>
          {s.desk ? colsOf(s) : null}
          {headOf(p, s, picked, indexed)}
          {/* What a view on its way dims (components.css [data-loading] [data-dims]): the rows, never the heads. */}
          {sectioned && s.sections ? sectionBodies(s.sections, s.span, rowOf) : oneBody(p, s, shown, rowOf)}
        </table>
      </div>
      <div className="dtable-foot">
        <span>{footWords(p, s.words)}</span>
      </div>
    </div>
  );
}
