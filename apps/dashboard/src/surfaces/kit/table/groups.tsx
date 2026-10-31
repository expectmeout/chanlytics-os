/**
 * A table's rows in groups (moved from people/table/table.tsx, decision 0083): the Pipeline's stages, and Needs review's
 * groups on a phone. Each group is its own `<tbody>` under a header row that names it, counts it and folds it; every row
 * of a group is drawn (a group is a page of rows), in the order its page gives (contracts' for the Pipeline), and
 * folding a group holds its head still under the pointer (kit/motion/hold-still.ts holdStill).
 */
import type { ReactElement, ReactNode } from "react";
import { holdStill } from "../../legacy-verbs";
import type { TableRow } from "./columns";

/** One group: its key, its words, what it says beside its count, its rows, and whether (and how) it folds. */
export interface TableSection<R extends TableRow> {
  key: string;
  label: ReactNode;
  meta?: ReactNode;
  rows: readonly R[];
  collapsed?: boolean;
  onToggle?: (() => void) | null;
  toggle?: ReactNode;
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
              <span className="tally">{s.rows.length}</span>
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
