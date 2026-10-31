/**
 * The table's heading row (moved from people/table/table.tsx, decision 0083): the select-all box, and a heading for each
 * column drawn. A heading that sorts is one button across the whole cell, with a quiet caret at rest so the ones that
 * sort can be told from the ones that do not, and its arrow once it is the sort (the member's: the tiebreak after it is
 * never shown). On a desk the edge of each heading is where its width is changed (edge.tsx), and a column a member may
 * move is dragged by its heading, or moved a place with Alt and an arrow on its button. Hookless: drawn with the table.
 */
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { ColumnEdge, holdingEdge } from "./edge";
import { TABLE_MIN_PX, baseOf, isMovable, isSizable, type AnyDataColumn, type SortDir } from "./columns";

/** What the table calls its rows: the foot's count, the select-all box's words, the rows' element ids, its name. */
export interface TableNouns {
  one: string;
  many: string;
  all: string;
  list: string;
  /** The word a row's element id is named with, where it is not `one`. */
  id?: string;
}

/** What a heading's edge and its moves do: the table's acts over its sizing and its order (data-table.tsx). */
export interface HeadActs {
  start: (key: string, from: number) => void;
  size: (key: string, px: number, commit: boolean) => void;
  cancel: () => void;
  reset: (key: string) => void;
  fit: (key: string, heading: HTMLElement) => void;
  move: (key: string, by: -1 | 1) => void;
  moveTo: (key: string, target: string) => void;
}

/** The column being dragged to a new place, for the heading it is over to say where it would land. */
let columnInHand: string | null = null;

/** A heading's words: the column's own, and for the row's acts, which have none, the word a screen reader needs. */
const headingWords = (c: { key: string; label: ReactNode }): ReactNode =>
  c.label === "" && c.key === "actions" ? <span className="rec-sr">Actions</span> : c.label;

/**
 * A heading a member may move is dragged by its heading to where another stands: where it would land is said on the
 * heading it is over, and a drag that began on the edge is the width's, not the column's.
 */
function headingDrag(key: string, acts: HeadActs | null, keys: readonly string[]) {
  if (!acts) return {};
  return {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      if (holdingEdge() || (e.target as HTMLElement).closest(".dtable-edge")) {
        e.preventDefault();
        return;
      }
      columnInHand = key;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", key);
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!columnInHand || columnInHand === key) return;
      e.preventDefault();
      e.currentTarget.setAttribute("data-drop", keys.indexOf(columnInHand) < keys.indexOf(key) ? "after" : "before");
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => e.currentTarget.removeAttribute("data-drop"),
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.removeAttribute("data-drop");
      if (columnInHand && columnInHand !== key) acts.moveTo(columnInHand, key);
      columnInHand = null;
    },
    onDragEnd: (e: DragEvent<HTMLElement>) => {
      columnInHand = null;
      for (const th of e.currentTarget.closest("tr")?.children ?? []) th.removeAttribute("data-drop");
    },
  };
}

export interface HeadProps {
  words: TableNouns;
  columns: readonly AnyDataColumn[];
  selectable: boolean;
  /** How many of the rows shown are selected, of how many. */
  picked: number;
  shown: number;
  onToggleAll: () => void;
  sortBy: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
  /** A desk's acts on widths and places; none on a phone, whose cards have neither. */
  acts: HeadActs | null;
  /** The column held at the right edge (the row's acts), where there is one. */
  pinEnd?: string | null;
  /** One body drawn in part says each row's place: the heads are row 1. */
  indexed: boolean;
}

/** The heading row. */
export function tableHead(p: HeadProps) {
  const { words, columns, selectable, picked, shown, onToggleAll, sortBy, sortDir, onSort, acts, indexed } = p;
  const pinOf = (c: AnyDataColumn) => (c.fill ? "start" : c.key === p.pinEnd ? "end" : undefined);
  const keys = columns.map((c) => c.key);
  return (
    <thead>
      <tr aria-rowindex={indexed ? 1 : undefined}>
        {selectable && (
          <th className="dtable-sel">
            <input
              type="checkbox"
              className="dtable-check"
              checked={shown > 0 && picked === shown}
              // Some of them picked: neither on nor off, so the box does not say everyone when it is not so.
              ref={(el) => {
                if (el) el.indeterminate = picked > 0 && picked < shown;
              }}
              onChange={onToggleAll}
              aria-label={words.all}
              title={words.all}
              data-testid="select-all"
            />
          </th>
        )}
        {columns.map((c) => {
          const movable = !!acts && isMovable(c);
          const here = sortBy === c.key;
          const text = headingWords(c);
          // The heading is drawn in its new place, and a control that was moved in the page has lost the keyboard.
          const shift = (by: -1 | 1, from: Element, control: string) => {
            if (!acts) return;
            const table = from.closest("table");
            acts.move(c.key, by);
            requestAnimationFrame(() => {
              const again = table && table.querySelector<HTMLElement>(`th[data-key="${c.key}"] ${control}`);
              if (again) again.focus();
            });
          };
          const move = (e: KeyboardEvent<HTMLElement>) => {
            if (!movable || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
            e.preventDefault();
            e.stopPropagation();
            shift(e.key === "ArrowLeft" ? -1 : 1, e.currentTarget, ".dtable-sort");
          };
          return (
            <th
              key={c.key}
              data-key={c.key}
              data-align={c.align}
              data-pin={pinOf(c)}
              data-sorts={c.sort ? "" : undefined}
              aria-sort={here ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
              {...headingDrag(c.key, movable ? acts : null, keys)}
            >
              {/* A heading that sorts is a button, so a keyboard reaches it: the sort was the cell's own click, which Tab never found. */}
              {c.sort ? (
                <button
                  type="button"
                  className="dtable-sort"
                  data-tip={c.hint}
                  aria-keyshortcuts={movable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
                  onClick={() => onSort(c.key)}
                  onKeyDown={move}
                >
                  {text}
                  <span className="dtable-arrow" aria-hidden="true" data-idle={here ? undefined : "true"}>
                    {here ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              ) : (
                <span className="dtable-words" data-tip={c.hint}>
                  {text}
                </span>
              )}
              {acts && isSizable(c) && typeof c.label === "string" && (
                <ColumnEdge
                  id={c.key}
                  label={c.label}
                  base={baseOf(c)}
                  min={TABLE_MIN_PX}
                  onStart={(from) => acts.start(c.key, from)}
                  onSize={(px, commit) => acts.size(c.key, px, commit)}
                  onCancel={acts.cancel}
                  onReset={() => acts.reset(c.key)}
                  onFit={(th) => acts.fit(c.key, th)}
                  onMove={movable ? (by, from) => shift(by, from, ".dtable-edge") : undefined}
                />
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
