/**
 * The table for any rows, for People and for Leads (a scope of People): the columns they are given, what a cell needs
 * (`ctx`), a selection, a keyboard cursor and a way to open a row (moved whole from legacy/pages/people-table.jsx,
 * decision 0015). It is hookless: the sort, the columns, the cursor and the selection are the page's (hooks/), and so is
 * how many rows it draws (row-window.ts), where the page's one keyboard listener can move them. It stays a
 * `<table class="cl-table">`, so the page's selectors and the phone's card rules hold.
 */
import { cloneElement, memo } from "react";
import type { ReactElement, ReactNode } from "react";
import { holdStill } from "../../legacy-verbs";
import { EmptyState } from "../../kit/empty/empty";
import type { TableColumn, TableCtx, TableEmpty, TableRow } from "../types";

/** The table's default for a door its page does not pass: one function, one set, for the page's life. */
export const PL_NO_SEL: ReadonlySet<string> = new Set();
const PL_NOOP = (): void => undefined;

/**
 * What the table calls its rows: the foot's count, the select-all label, and the row id prefix the page's cursor effect
 * reads. The empty state's default title is People's own, and the Leads scope passes an `empty` of its own.
 */
const PERSON_NOUN = { one: "person", many: "people", all: "Select everyone shown" };
const PL_NOUNS: Record<string, { one: string; many: string; all: string }> = {
  person: PERSON_NOUN,
  lead: { one: "lead", many: "leads", all: "Select every lead shown" },
};

/** The rows in groups (the Pipeline's stages): each its own <tbody> under a header row that names it. */
interface TableSection<R extends TableRow> {
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
  columns: readonly TableColumn<R, X>[];
  ctx: X | null;
  words: { one: string; many: string; all: string };
  selectable: boolean;
  selected: boolean;
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
  columns,
  ctx,
  words,
  selectable,
  selected,
  focused,
  tabStop,
  onToggle,
  onCursor,
  onOpen,
  rowClass,
}: RowProps<R, X>) {
  return (
    <tr
      id={`${words.one}-${p.id}`}
      className={`${selected ? "selected" : ""} ${focused ? "focused" : ""} ${rowClass ? rowClass(p) : ""}`}
      aria-selected={selectable ? selected : undefined}
      tabIndex={tabStop ? 0 : -1}
      onFocus={() => {
        if (ctx && ctx.onWarm) ctx.onWarm(p.id);
        if (!focused) onCursor(p.id);
      }}
      onPointerEnter={ctx && ctx.onWarm ? () => ctx.onWarm?.(p.id) : undefined}
      onClick={() => onOpen(p.id)}
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
      {columns.map((c) => {
        const td = c.cell(p, ctx as X);
        return c.off ? cloneElement(td, { className: `${td.props.className || ""} pl-col-off` }) : td;
      })}
    </tr>
  );
}
const PeopleRowMemo = memo(PeopleRow) as typeof PeopleRow;

/** The rows drawn: all of them, or a window and, at its foot, a row with nothing in it that is watched. */
const plWindowRows = <R extends TableRow>(
  rows: readonly R[],
  budget: number,
  row: (p: R, i: number) => ReactElement,
  span: number,
): ReactElement[] =>
  budget < rows.length
    ? [
        ...rows.slice(0, budget).map(row),
        <tr key="pl-foot" id="pl-foot" className="pl-foot" aria-hidden="true">
          <td colSpan={span} />
        </tr>,
      ]
    : rows.map(row);

/**
 * The table's sections, one <tbody> each: a header row (a <th scope="rowgroup"> across every column, with no id), then
 * the section's rows unless it is collapsed. A first draw's budget runs across the sections in turn, and a section it
 * cannot reach waits for the next draw whole, header and all.
 */
const plSectionBodies = <R extends TableRow>(
  sections: readonly TableSection<R>[],
  span: number,
  budget: number,
  row: (p: R, i: number) => ReactElement,
): ReactElement[] => {
  const out: ReactElement[] = [];
  let left = budget;
  let at = 0;
  for (const s of sections) {
    if (!s.collapsed && left <= 0) break;
    const shown = s.collapsed ? [] : left < s.rows.length ? s.rows.slice(0, left) : s.rows;
    left -= shown.length;
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
              {/* Folding a group takes its rows from under the head: the head holds still (data-bits holdStill). */}
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
  budget?: number;
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
}

/** The table's heading row: the select-all box, and a heading for each column (a heading that sorts is a button). */
function tableHead<R extends TableRow, X extends TableCtx>(p: {
  words: { one: string; many: string; all: string };
  columns: readonly TableColumn<R, X>[];
  selectable: boolean;
  rows: readonly R[];
  sel: ReadonlySet<string>;
  onToggleAll: () => void;
  sortBy: string;
  sortDir: string;
  onSort: (key: string) => void;
}) {
  const { words, columns, selectable, rows, sel, onToggleAll, sortBy, sortDir, onSort } = p;
  return (
    <thead>
      <tr>
        {selectable && (
          <th className="cl-sel">
            <input
              type="checkbox"
              className="cl-check"
              checked={rows.length > 0 && rows.every((r) => sel.has(r.id))}
              onChange={onToggleAll}
              aria-label={words.all}
              title={words.all}
              data-testid="select-all"
            />
          </th>
        )}
        {columns.map((c) => (
          <th
            key={c.key}
            className={`${c.sortable ? "sortable" : ""} ${c.pinned ? "pl-pin" : ""} ${c.key === "actions" ? "cl-actions-head" : ""} ${c.off ? "pl-col-off" : ""}`}
            aria-sort={sortBy === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
          >
            {/* A heading that sorts is a button, so a keyboard reaches it: the sort was the cell's own click, which Tab never found. */}
            {c.sortable ? (
              <button type="button" className="cl-th-sort" onClick={() => onSort(c.key)}>
                {c.label}
                {sortBy === c.key && <span className="sort-arr">{sortDir === "asc" ? "▲" : "▼"}</span>}
              </button>
            ) : (
              c.label
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * The table, for any rows: the columns it is given (one that is `off` drawn with pl-col-off on its heading and every
 * cell, which only a desktop hides), what a cell needs (`ctx`), a selection, a keyboard cursor and a way to open a row.
 * `busy`: the rows drawn are the last view's while the one asked for is on its way. `sections`: the rows in groups.
 */
export function PeopleTable<R extends TableRow, X extends TableCtx>({
  budget = Infinity,
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
}: PeopleTableProps<R, X>) {
  const words = PL_NOUNS[noun] || PERSON_NOUN;
  // `selectMode`: the page's Select people (a phone's more-menu), a selection begun with nobody picked yet.
  const selecting = selectMode || rows.some((p) => sel.has(p.id));
  const span = columns.length + (selectable ? 1 : 0);
  const row = (p: R, i: number) => (
    <PeopleRowMemo
      key={p.id}
      p={p}
      columns={columns}
      ctx={ctx}
      words={words}
      selectable={selectable}
      selected={sel.has(p.id)}
      focused={cursor === p.id}
      tabStop={cursor === p.id || (!cursor && i === 0)}
      onToggle={onToggle}
      onCursor={onCursor}
      onOpen={onOpen}
      rowClass={rowClass}
    />
  );
  const emptyRow = () => (
    <tr>
      <td colSpan={span}>
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
    <div className={`cl-table-wrap pl-table-wrap ${selecting ? "selecting" : ""}`}>
      <div
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
        <table className="cl-table pl-table">
          {tableHead({ words, columns, selectable, rows, sel, onToggleAll, sortBy, sortDir, onSort })}
          {/* What a view on its way dims (components.css [data-loading] [data-dims]): the rows, never the heads. */}
          {sections && sections.some((s) => s.rows.length > 0) ? (
            plSectionBodies(sections, span, budget, row)
          ) : (
            <tbody data-dims>
              {/* The cursor's row is the table's one tab stop (the first row until there is a cursor), and a row focused --
                  by Tab, or by a click -- takes the cursor, so what a screen reader hears and what the keys act on agree.
                  J and K move focus with the cursor (the page's effect on `cursor`). */}
              {plWindowRows(rows, budget, row, span)}
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
