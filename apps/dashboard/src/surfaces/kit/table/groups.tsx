/**
 * A table's rows in groups (moved from people/table/table.tsx, decision 0083): the Pipeline's stages, and Needs review's
 * groups on a phone. Each group is its own `<tbody>` under a header row that names it, counts it and folds it; every row
 * of a group is drawn (a group is a page of rows), in the order its page gives (contracts' for the Pipeline), and
 * folding a group holds its head still under the pointer (kit/motion/hold-still.ts holdStill).
 *
 * A long list can't afford that: sections draw every row. So a table may also say which group each row stands in
 * (`groupOf`, the table review of 5 Nov 2026), and a head becomes one more item of its windowed list (`tableItems`):
 * measured as a row is, and kept drawn however far the list is scrolled, so the sticky rule holds it under the heading
 * while its group scrolls. That is what lets a row stop repeating its group's word.
 */
import type { ReactElement, ReactNode } from "react";
import { holdStill } from "../../frame-verbs";
import type { TableRow } from "./columns";

/** One group: its key, its words, what it says beside its count, its rows, and whether (and how) it folds. */
export interface TableSection<R extends TableRow> {
  key: string;
  label: ReactNode;
  meta?: ReactNode;
  rows: readonly R[];
  /**
   * The figure beside its name: left out, how many rows it holds; null draws none, for a group of a list read a page at a
   * time, whose rows on hand are not yet all it holds (Content's This week and Earlier).
   */
  count?: number | null;
  collapsed?: boolean;
  onToggle?: (() => void) | null;
  toggle?: ReactNode;
}

/** What a page says of the group a row stands in: its key, its words, and the view's count of it, where that was read. */
export interface TableGroup {
  key: string;
  label: ReactNode;
  count?: number | null;
}

/** One item of a table's windowed list: a group's head, or a row by where it stands in the rows. */
export type TableItem =
  { kind: "head"; key: string; label: ReactNode; count: number | null } | { kind: "row"; rowIndex: number };

/**
 * The rows with a head before each run of a group; without `groupOf`, exactly the rows. A key that comes back gets no
 * second head: the read orders the rows, and a lead whose group changed since stays where it stands until the next one.
 * Show more carries on under the last head, since a page starting in the same group is the same run.
 */
export function tableItems<R extends TableRow>(
  rows: readonly R[],
  groupOf: ((row: R) => TableGroup | null) | null | undefined,
): TableItem[] {
  const seen = new Set<string>();
  const out: TableItem[] = [];
  rows.forEach((r, rowIndex) => {
    const group = groupOf ? groupOf(r) : null;
    if (group && !seen.has(group.key)) {
      seen.add(group.key);
      out.push({ kind: "head", key: group.key, label: group.label, count: group.count ?? null });
    }
    out.push({ kind: "row", rowIndex });
  });
  return out;
}

/** A head among a body's windowed rows: no id, so a fit measures no head and the keys walk over it, and nothing folds. */
export function groupHeadRow(p: {
  item: Extract<TableItem, { kind: "head" }>;
  span: number;
  /** Where it stands in the list as the window counts it, and where a screen reader does. */
  index: number;
  rowIndex: number;
  measure: (el: Element | null) => void;
}): ReactElement {
  return (
    <tr
      key={`head-${p.item.key}`}
      ref={p.measure}
      data-index={p.index}
      aria-rowindex={p.rowIndex}
      className="dtable-group"
      data-testid="table-group"
    >
      <th colSpan={p.span}>
        <span className="dtable-group-line">
          <span className="dtable-group-label">{p.item.label}</span>
          {p.item.count === null ? null : <span className="tally">{p.item.count}</span>}
        </span>
      </th>
    </tr>
  );
}

/** The groups' bodies: a header row (a `<th scope="rowgroup">` across every column, with no id), then its rows unless folded. */
export function sectionBodies<R extends TableRow>(
  sections: readonly TableSection<R>[],
  span: number,
  row: (r: R, i: number) => ReactElement,
): ReactElement[] {
  const out: ReactElement[] = [];
  let at = 0;
  for (const s of sections) {
    const shown = s.collapsed ? [] : s.rows;
    const first = at;
    const { onToggle } = s;
    at += shown.length;
    out.push(
      <tbody key={s.key} data-dims data-section={s.key}>
        <tr className={`dtable-group${s.collapsed ? " is-folded" : ""}`} data-testid="table-section">
          <th scope="rowgroup" colSpan={span}>
            <span className="dtable-group-line">
              <span className="dtable-group-label">{s.label}</span>
              {s.count === null ? null : <span className="tally">{s.count ?? s.rows.length}</span>}
              {s.meta ? (
                <>
                  <span className="dtable-group-dot" aria-hidden="true">
                    ·
                  </span>
                  <span className="dtable-group-meta" data-testid="table-section-meta">
                    {s.meta}
                  </span>
                </>
              ) : null}
              {onToggle && s.toggle ? (
                <button
                  type="button"
                  className="dtable-group-toggle"
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
        {shown.map((r, i) => row(r, first + i))}
      </tbody>,
    );
  }
  return out;
}
