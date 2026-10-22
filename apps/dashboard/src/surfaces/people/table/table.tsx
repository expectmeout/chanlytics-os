/**
 * The table for any rows, for People and for Leads (a scope of People): the columns they are given, what a cell needs
 * (`ctx`), a selection, a keyboard cursor and a way to open a row (moved whole from legacy/pages/people-table.jsx,
 * decision 0015). Its state is the page's: the sort, the columns, their widths and order (`layout`, use-layout.ts), the
 * cursor and the selection are held in hooks/, where the page's one keyboard listener can move them. A long list draws the
 * rows on screen and a few either side (kit/rows/shown-rows.ts), the cursor's row always among them. It stays a `<table class="cl-table">`, so the page's selectors and the phone's card
 * rules hold; on a desktop it is a fixed layout, each column the width table/layout.ts settles from what the column
 * declares, the room the table has and what the member dragged.
 */
import { memo, useCallback } from "react";
import type { KeyboardEvent, ReactElement, ReactNode, RefObject } from "react";
import { holdStill, warmsOnReach } from "../../legacy-verbs";
import { EmptyState } from "../../kit/empty/empty";
import { useRowsArrive } from "../../kit/motion/use-rows-arrive";
import { RowGap } from "../../kit/rows/row-gap";
import { useShownRows } from "../../kit/rows/shown-rows";
import type { TableColumn, TableCtx, TableEmpty, TableRow } from "../types";
import { ColumnEdge, fitWidthOf, holdingEdge } from "./edge";
import { PL_DRAG_MIN_PX, plClampWidth, resolveColumnWidths } from "./layout";
import type { SizedColumn } from "./layout";
import type { TableLayout } from "./use-layout";

/** The table's default for a door its page does not pass: one function, one set, for the page's life. */
const PL_NO_SEL: ReadonlySet<string> = new Set();
const PL_NOOP = (): void => undefined;

/** The select column: a box, and the pane's edge before it. It holds still at this width. */
const SELECT_COLUMN: SizedColumn = { key: "sel", width: { base: 42 } };

/**
 * What the table calls its rows: the foot's count, the select-all label, and the row id prefix the page's cursor effect
 * reads. The empty state's default title is People's own, and the Leads scope passes an `empty` of its own. `list` names
 * the table to a screen reader.
 */
interface Nouns {
  one: string;
  many: string;
  all: string;
  list: string;
  /** The word a row's element id is named with, where it is not `one`. */
  id?: string;
}
const PERSON_NOUN: Nouns = { one: "person", many: "people", all: "Select everyone shown", list: "People" };
const PL_NOUNS: Record<string, Nouns> = {
  person: PERSON_NOUN,
  // The Pipeline's rows are deals (0029: a row per open deal), counted as deals at the foot; each row's element is still
  // named for its person's row (`person-<row>`), which the Pipeline's focus and its board look up (Ruben, 10 Oct 2026).
  deal: { one: "deal", many: "deals", all: "Select every deal shown", list: "Deals", id: "person" },
  lead: { one: "lead", many: "leads", all: "Select every lead shown", list: "Leads" },
};

/** Words the member selected in a row (a number they mean to copy): a drag that ends on the row is not a press on it. */
const pickedWords = (row: Element | null | undefined): boolean => {
  const s = typeof window !== "undefined" && window.getSelection ? window.getSelection() : null;
  return !!s && !s.isCollapsed && s.toString().trim() !== "" && !!row && !!s.anchorNode && row.contains(s.anchorNode);
};

/** The column being dragged to a new place, for the heading it is over to say where it would land. */
let columnInHand: string | null = null;

/** The rows in groups (the Pipeline's stages): each its own <tbody> under a header row that names it. */
export interface TableSection<R extends TableRow> {
  key: string;
  label: ReactNode;
  meta?: ReactNode;
  rows: readonly R[];
  collapsed?: boolean;
  onToggle?: (() => void) | null;
  toggle?: ReactNode;
}

interface RowProps<R extends TableRow, X extends TableCtx> {
  p: R;
  /** Where the row stands in the list, and what measures it once drawn (kit/rows/shown-rows.ts). */
  index: number;
  measure: (el: Element | null) => void;
  /** Its row among the table's, heads included, where the table draws only some of them (`aria-rowindex`). */
  rowIndex?: number;
  columns: readonly TableColumn<R, X>[];
  ctx: X | null;
  words: Nouns;
  selectable: boolean;
  selected: boolean;
  /** A selection is under way (somebody is picked, or the page began one): a card's face is then its checkbox. */
  selecting: boolean;
  focused: boolean;
  tabStop: boolean;
  onToggle: (id: string) => void;
  onCursor: (id: string) => void;
  onOpen: (id: string) => void;
  rowClass: ((p: R) => string) | null;
}

/**
 * One row. Drawn again only when something of its own changed: its view model, whether it is selected, the cursor,
 * the columns, the cell context. React.memo is not a hook, so the table stays hookless for the tests' stub React.
 */
function PeopleRow<R extends TableRow, X extends TableCtx>({
  p,
  index,
  measure,
  rowIndex,
  columns,
  ctx,
  words,
  selectable,
  selected,
  selecting,
  focused,
  tabStop,
  onToggle,
  onCursor,
  onOpen,
  rowClass,
}: RowProps<R, X>) {
  // What a card's face says of the selection: a ring while one is under way, the ink with its tick for this one in it.
  const pick = selected ? "chosen" : selecting ? "choose" : undefined;
  return (
    <tr
      ref={measure}
      data-index={index}
      aria-rowindex={rowIndex}
      id={`${words.id ?? words.one}-${p.id}`}
      className={`${selected ? "selected" : ""} ${focused ? "focused" : ""} ${rowClass ? rowClass(p) : ""}`}
      aria-selected={selectable ? selected : undefined}
      tabIndex={tabStop ? 0 : -1}
      onFocus={() => {
        if (ctx && ctx.onWarm) ctx.onWarm(p.id);
        if (!focused) onCursor(p.id);
      }}
      // A pointer that rests on the row warms it, never a finger (legacy-verbs warmsOnReach).
      onPointerEnter={ctx && ctx.onWarm ? (e) => warmsOnReach(e) && ctx.onWarm?.(p.id) : undefined}
      onClick={(e) => {
        // The words selected are this row's own (a drag across a number to copy it); the page's other words are not.
        if (!pickedWords(e && e.currentTarget)) onOpen(p.id);
      }}
    >
      {selectable && (
        <td className="cl-sel" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="cl-check"
            checked={selected}
            onChange={() => onToggle(p.id)}
            aria-label={`Select ${p.name}`}
            data-testid="row-select"
          />
        </td>
      )}
      {columns.map((c) => c.cell(p, ctx as X, pick))}
    </tr>
  );
}
const PeopleRowMemo = memo(PeopleRow) as typeof PeopleRow;

/**
 * The table's sections, one <tbody> each: a header row (a <th scope="rowgroup"> across every column, with no id), then
 * the section's rows unless it is collapsed. Every row of a section is drawn: the Pipeline's groups are a page of deals.
 */
const plSectionBodies = <R extends TableRow>(
  sections: readonly TableSection<R>[],
  span: number,
  row: (p: R, i: number) => ReactElement,
): ReactElement[] => {
  const out: ReactElement[] = [];
  let at = 0;
  for (const s of sections) {
    const shown = s.collapsed ? [] : s.rows;
    const first = at;
    const { onToggle } = s;
    at += shown.length;
    out.push(
      <tbody key={s.key} data-dims data-section={s.key}>
        <tr className={`pl-sec-head${s.collapsed ? " is-folded" : ""}`} data-testid="table-section">
          <th scope="rowgroup" colSpan={span}>
            <span className="pl-sec-line">
              <span className="pl-sec-label">{s.label}</span>
              <span className="tally">{s.rows.length}</span>
              {s.meta ? (
                <>
                  <span className="pl-sec-dot" aria-hidden="true">
                    ·
                  </span>
                  <span className="pl-sec-meta" data-testid="table-section-meta">
                    {s.meta}
                  </span>
                </>
              ) : null}
              {/* Folding a group takes its rows from under the head: the head holds still (kit/motion/hold-still.ts holdStill). */}
              {onToggle && s.toggle ? (
                <button
                  type="button"
                  className="pl-sec-toggle"
                  aria-expanded={!s.collapsed}
                  onClick={(e) => holdStill(e && e.currentTarget, onToggle)}
                  data-testid="table-section-toggle"
                >
                  {s.toggle}
                </button>
              ) : null}
            </span>
          </th>
        </tr>
        {shown.map((p, i) => row(p, first + i))}
      </tbody>,
    );
  }
  return out;
};

interface PeopleTableProps<R extends TableRow, X extends TableCtx> {
  columns: readonly TableColumn<R, X>[];
  ctx: X | null;
  rows: readonly R[];
  total: number;
  sortBy: string;
  sortDir: string;
  onSort: (key: string) => void;
  onOpen: (id: string) => void;
  filtered: boolean;
  onClearFilters: () => void;
  selectable?: boolean;
  sel?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  cursor?: string | null;
  onCursor?: (id: string) => void;
  empty?: TableEmpty | null;
  scrolled?: boolean;
  onScrolled?: (on: boolean) => void;
  noun?: string;
  rowClass?: ((p: R) => string) | null;
  busy?: boolean;
  selectMode?: boolean;
  sections?: readonly TableSection<R>[] | null;
  /**
   * The table's element for the kit's swap motion (kit/motion, the page's hook, asked with `TABLE_BODIES`): its row
   * groups rise as the list under the view changes, one body or the sections' several, and the heads hold still.
   */
  swapRef?: RefObject<HTMLTableElement | null> | null;
  /** The widths, the order and the row height (use-layout.ts): a desktop's. None draws the table as the browser sizes it. */
  layout?: TableLayout | null;
}

/** A row's height before it is measured: a phone's card, else a desktop's row at its density (layout.ts). */
const rowHeightOf = (layout: TableLayout | null): number => (!layout ? 84 : layout.density === "compact" ? 37 : 49);

/**
 * The rows the table draws (kit/rows/shown-rows.ts): those on screen and a few either side, the cursor's always (its keys
 * find it) or, with no cursor, the first (the table's one tab stop). A table in sections draws every row.
 */
function useTableRows<R extends TableRow>(
  rows: readonly R[],
  cursor: string | null,
  layout: TableLayout | null,
  inSections: boolean,
) {
  const cursorAt = cursor === null ? -1 : rows.findIndex((r) => r.id === cursor);
  return useShownRows({
    count: inSections ? 0 : rows.length,
    estimate: rowHeightOf(layout),
    keyOf: (i) => rows[i]?.id ?? String(i),
    keep: cursorAt >= 0 ? [cursorAt] : [0],
  });
}

/** What of the table rises on a swap (kit/motion use-swap-motion.ts `parts`): its row groups, never its heads. */
export const TABLE_BODIES = ":scope > tbody";

/**
 * Every column's width, settled from what each declares, the room the table has and what the member dragged: the select
 * column first, since it holds some of the room. Whole pixels that add up to the room, drawn as a fixed layout; none where
 * the table has no layout (a phone's cards, the node tests).
 */
const columnWidths = (
  layout: TableLayout | null,
  columns: readonly SizedColumn[],
  selectable: boolean,
): readonly number[] | null =>
  layout
    ? resolveColumnWidths(selectable ? [SELECT_COLUMN, ...columns] : columns, layout.widths, layout.available).widths
    : null;

/** What a layout adds to the table's three boxes: the row height on the frame, the room's measure on the scroller, the fixed layout on the table. */
const layoutAttrs = (layout: TableLayout | null, widths: readonly number[] | null) => ({
  frame: { "data-density": layout ? layout.density : undefined },
  scroll: { ref: layout ? layout.scrollRef : undefined },
  table: { "data-fixed": widths ? "true" : undefined },
});

/** The widths as the table's `<colgroup>`, which a fixed layout reads; the select column's is the first. */
const tableColgroup = (widths: readonly number[] | null, columns: readonly { key: string }[], selectable: boolean) =>
  widths && (
    <colgroup>
      {selectable && <col width={widths[0]} />}
      {columns.map((c, i) => (
        <col key={c.key} width={widths[i + (selectable ? 1 : 0)]} />
      ))}
    </colgroup>
  );

/** A heading's words: the column's own, and for the row's acts, which have none, the word a screen reader needs. */
const headingWords = (c: { key: string; label: ReactNode }): ReactNode =>
  c.label === "" && c.key === "actions" ? <span className="rec-sr">Actions</span> : c.label;

/**
 * The table's heading row: the select-all box, and a heading for each column. A heading that sorts is one button across
 * the whole cell, with a quiet caret at rest so the ones that sort can be told from the ones that do not, and its
 * arrow once it is the sort. On a desktop the edge of each heading is where its width is changed (edge.tsx), and a
 * column a member may move is dragged by its heading, or moved a place with Alt and an arrow on its button.
 */
function tableHead<R extends TableRow, X extends TableCtx>(p: {
  words: Nouns;
  columns: readonly TableColumn<R, X>[];
  selectable: boolean;
  rows: readonly R[];
  sel: ReadonlySet<string>;
  onToggleAll: () => void;
  sortBy: string;
  sortDir: string;
  onSort: (key: string) => void;
  layout: TableLayout | null;
  widths: readonly number[] | null;
  indexed: boolean; // one body drawn in part says each row's place: the heads are row 1
}) {
  const { words, columns, selectable, rows, sel, onToggleAll, sortBy, sortDir, onSort, layout, widths, indexed } = p;
  const picked = rows.filter((r) => sel.has(r.id)).length;
  const keys = columns.map((c) => c.key);
  return (
    <thead>
      <tr aria-rowindex={indexed ? 1 : undefined}>
        {selectable && (
          <th className="cl-sel">
            <input
              type="checkbox"
              className="cl-check"
              checked={rows.length > 0 && picked === rows.length}
              // Some of them picked: neither on nor off, so the box does not say everyone when it is not so.
              ref={(el) => {
                if (el) el.indeterminate = picked > 0 && picked < rows.length;
              }}
              onChange={onToggleAll}
              aria-label={words.all}
              title={words.all}
              data-testid="select-all"
            />
          </th>
        )}
        {columns.map((c, i) => {
          const movable = !!layout && !c.pinned && !c.fixed;
          const here = sortBy === c.key;
          const text = headingWords(c);
          // The heading is drawn in its new place, and a control that was moved in the page has lost the keyboard.
          const shift = (by: -1 | 1, from: Element, control: string) => {
            if (!layout) return;
            const table = from.closest("table");
            layout.onMove(c.key, by);
            requestAnimationFrame(() => {
              const again = table && table.querySelector<HTMLElement>(`th[data-key="${c.key}"] ${control}`);
              if (again) again.focus();
            });
          };
          const move = (e: KeyboardEvent<HTMLElement>) => {
            if (!movable || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
            e.preventDefault();
            e.stopPropagation();
            shift(e.key === "ArrowLeft" ? -1 : 1, e.currentTarget, ".cl-th-sort");
          };
          return (
            <th
              key={c.key}
              data-key={c.key}
              data-align={c.align}
              className={`${c.sortable ? "sortable" : ""} ${c.pinned ? "pl-pin" : ""} ${c.key === "actions" ? "cl-actions-head" : ""}`}
              aria-sort={here ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
              draggable={movable ? true : undefined}
              onDragStart={
                movable && layout
                  ? (e) => {
                      // A drag that began on the edge is the width's, not the column's.
                      if (holdingEdge() || (e.target as HTMLElement).closest(".pl-edge")) {
                        e.preventDefault();
                        return;
                      }
                      columnInHand = c.key;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.key);
                    }
                  : undefined
              }
              onDragOver={
                movable && layout
                  ? (e) => {
                      if (!columnInHand || columnInHand === c.key) return;
                      e.preventDefault();
                      e.currentTarget.setAttribute(
                        "data-drop",
                        keys.indexOf(columnInHand) < keys.indexOf(c.key) ? "after" : "before",
                      );
                    }
                  : undefined
              }
              onDragLeave={movable ? (e) => e.currentTarget.removeAttribute("data-drop") : undefined}
              onDrop={
                movable && layout
                  ? (e) => {
                      e.preventDefault();
                      e.currentTarget.removeAttribute("data-drop");
                      if (columnInHand && columnInHand !== c.key) layout.onMoveTo(columnInHand, c.key);
                      columnInHand = null;
                    }
                  : undefined
              }
              onDragEnd={
                movable
                  ? (e) => {
                      columnInHand = null;
                      for (const th of e.currentTarget.closest("tr")?.children ?? []) th.removeAttribute("data-drop");
                    }
                  : undefined
              }
            >
              {/* A heading that sorts is a button, so a keyboard reaches it: the sort was the cell's own click, which Tab never found. */}
              {c.sortable ? (
                <button
                  type="button"
                  className="cl-th-sort"
                  data-tip={c.hint}
                  aria-keyshortcuts={movable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
                  onClick={() => onSort(c.key)}
                  onKeyDown={move}
                >
                  {text}
                  <span className="sort-arr" aria-hidden="true" data-idle={here ? undefined : "true"}>
                    {here ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              ) : (
                <span className="cl-th-text" data-tip={c.hint}>
                  {text}
                </span>
              )}
              {layout && widths && !c.fixed && typeof c.label === "string" && (
                <ColumnEdge
                  label={c.label}
                  width={widths[i + (selectable ? 1 : 0)] ?? 0}
                  min={PL_DRAG_MIN_PX}
                  onSize={(px, commit) => layout.onSize(c.key, px, commit)}
                  onCancel={layout.onCancel}
                  onReset={() => layout.onReset(c.key)}
                  onFit={(th) => layout.onSize(c.key, plClampWidth(fitWidthOf(th)), true)}
                  onMove={movable ? (by, from) => shift(by, from, ".pl-edge") : undefined}
                />
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

/**
 * The table, for any rows: the columns it is given (a column a member turned off is not among them), what a cell needs (`ctx`), a selection, a keyboard cursor and a way to open a row.
 * `busy`: the rows drawn are the last view's while the one asked for is on its way. `sections`: the rows in groups.
 */
export function PeopleTable<R extends TableRow, X extends TableCtx>({
  columns,
  ctx,
  rows,
  total,
  sortBy,
  sortDir,
  onSort,
  onOpen,
  filtered,
  onClearFilters,
  selectable = false,
  sel = PL_NO_SEL,
  onToggle = PL_NOOP,
  onToggleAll = PL_NOOP,
  cursor = null,
  onCursor = PL_NOOP,
  empty = null,
  scrolled = false,
  onScrolled = PL_NOOP,
  noun = "person",
  rowClass = null,
  busy = false,
  selectMode = false,
  sections = null,
  swapRef = null,
  layout = null,
}: PeopleTableProps<R, X>) {
  const words = PL_NOUNS[noun] || PERSON_NOUN;
  const widths = columnWidths(layout, columns, selectable);
  const attrs = layoutAttrs(layout, widths);
  // The first rows rise in as the table arrives, as the Inbox's do (kit/motion/use-rows-arrive.ts).
  const arrive = useRowsArrive<HTMLTableElement>();
  // One element for both: the rows arrive and swap in under the table's heads.
  const tableRef = useCallback(
    (el: HTMLTableElement | null) => {
      arrive(el);
      if (swapRef) swapRef.current = el;
    },
    [arrive, swapRef],
  );
  // `selectMode`: the page's Select people (a phone's more-menu), a selection begun with nobody picked yet.
  const selecting = selectMode || rows.some((p) => sel.has(p.id));
  const span = columns.length + (selectable ? 1 : 0);
  const shown = useTableRows(rows, cursor, layout, !!sections);
  const row = (p: R, i: number, rowIndex?: number) => (
    <PeopleRowMemo
      key={p.id}
      p={p}
      index={i}
      measure={shown.measure}
      rowIndex={rowIndex}
      columns={columns}
      ctx={ctx}
      words={words}
      selectable={selectable}
      selected={sel.has(p.id)}
      selecting={selecting}
      focused={cursor === p.id}
      tabStop={cursor === p.id || (!cursor && i === 0)}
      onToggle={onToggle}
      onCursor={onCursor}
      onOpen={onOpen}
      rowClass={rowClass}
    />
  );
  // One body drawn in part says how many rows it has and where each drawn one stands, so a screen reader counts the list
  // and not the screen of it drawn (the heads are row 1). The Pipeline's sections draw every row, and say nothing more.
  const sectioned = !!sections && sections.some((s) => s.rows.length > 0);
  const indexed = !sectioned && rows.length > 0;
  const emptyRow = () => (
    <tr>
      <td colSpan={span} className="pl-nobody-cell">
        <EmptyState
          kind="line"
          className="empty-center"
          glyph="search"
          title={empty ? empty.title : total === 0 ? "Nobody has written or phoned yet." : "No one matches this view."}
          body={empty ? empty.body : undefined}
          action={
            empty ? empty.action : total > 0 && filtered ? { label: "Clear filters", onClick: onClearFilters } : null
          }
        />
      </td>
    </tr>
  );
  return (
    <div className={`cl-table-wrap pl-table-wrap ${selecting ? "selecting" : ""}`} {...attrs.frame}>
      <div
        {...attrs.scroll}
        className={`pl-table-scroll ${scrolled ? "scrolled" : ""}`}
        onScroll={(e) => {
          const on = e.currentTarget.scrollLeft > 0;
          if (on !== scrolled) onScrolled(on);
        }}
        aria-busy={busy ? "true" : undefined}
        data-testid="people-table-scroll"
      >
        {/* pl-table is the phone's hook: on a narrow screen these rows stop being a sideways scroll and stack, so the
            state is on the row instead of off the right edge. */}
        <table
          className="cl-table pl-table"
          ref={tableRef}
          aria-label={words.list}
          aria-rowcount={indexed ? rows.length + 1 : undefined}
          {...attrs.table}
        >
          {tableColgroup(widths, columns, selectable)}
          {tableHead({
            words,
            columns,
            selectable,
            rows,
            sel,
            onToggleAll,
            sortBy,
            sortDir,
            onSort,
            layout,
            widths,
            indexed,
          })}
          {/* What a view on its way dims (components.css [data-loading] [data-dims]): the rows, never the heads. */}
          {sectioned ? (
            plSectionBodies(sections, span, row)
          ) : (
            <tbody data-dims ref={shown.listRef}>
              {/* The cursor's row is the table's one tab stop (the first row until there is a cursor), and a row focused --
                  by Tab, or by a click -- takes the cursor, so what a screen reader hears and what the keys act on agree.
                  J and K move focus with the cursor (the page's effect on `cursor`). */}
              {shown.parts.map((part) => {
                if (part.kind === "gap")
                  return <RowGap key={part.key} height={part.height} span={span} className="pl-foot" />;
                const p = rows[part.index];
                return p ? row(p, part.index, part.index + 2) : null;
              })}
              {rows.length === 0 && emptyRow()}
            </tbody>
          )}
        </table>
      </div>
      <div className="cl-table-foot">
        <span>
          {filtered ? `Showing ${rows.length} of ${total}` : `${total} ${total === 1 ? words.one : words.many}`}
        </span>
      </div>
    </div>
  );
}
