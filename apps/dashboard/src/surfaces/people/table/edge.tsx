/**
 * The edge of a column's heading: where its width is changed. A drag with a mouse, a finger or a pen sets it (the
 * pointer is captured, so the drag holds past the edge of the heading), a double press fits the column to what it holds,
 * and for a keyboard the edge is a focusable slider (a value the arrows step, with Shift a bigger step, as a window
 * splitter is: a separator that takes focus is, in the lint's words, no interactive element), Enter fits it and Delete or Backspace gives it back its own width. A width dragged to is saved with the
 * view once the drag ends, never while it is under way (hooks/use-controls.ts).
 *
 * Hookless, as the table is: one drag is under way at a time, and it lives in the closure of the press that began it.
 */
import type { KeyboardEvent, PointerEvent } from "react";
import { PL_DRAG_MAX_PX, PL_NUDGE_BIG_PX, PL_NUDGE_PX, plClampWidth } from "./layout";

/** An edge is held down: a column's heading, which is draggable, must not start its own drag from the press that began a width's. */
let edgeIsHeld = false;
export const holdingEdge = (): boolean => edgeIsHeld;

interface ColumnEdgeProps {
  /** The heading's words, which name the edge to a screen reader. */
  label: string;
  /** The column's width now, and the least it may be given. */
  width: number;
  min: number;
  /** A width, live while a drag is under way (`commit` false) and final once it ends having moved, or a key sets it. */
  onSize: (px: number, commit: boolean) => void;
  /** A drag that ended with no width to keep (a press with no movement, or the system's cancel): the live width goes. */
  onCancel: () => void;
  /** Give the column back the width it was declared with. */
  onReset: () => void;
  /** Fit the column to its content: the heading it is the edge of is handed over to measure. */
  onFit: (heading: HTMLElement) => void;
  /** Alt and an arrow move the column a place (a column a member may move), from the element that holds the keyboard. */
  onMove?: (by: -1 | 1, from: Element) => void;
}

/** The edge: a thin slider at the heading's right, wider to hit than to see. */
export function ColumnEdge({ label, width, min, onSize, onCancel, onReset, onFit, onMove }: ColumnEdgeProps) {
  const press = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const edge = e.currentTarget;
    const x0 = e.clientX;
    const w0 = width;
    // Never narrower than the heading says: its words and caret whole, or the column's own least, whichever is wider.
    const floor = Math.max(min, headingFloorOf(edge.closest("th")));
    let px = w0;
    edgeIsHeld = true;
    edge.setPointerCapture(e.pointerId);
    edge.setAttribute("data-dragging", "true");
    const move = (m: globalThis.PointerEvent) => {
      px = Math.max(Math.min(floor, w0), plClampWidth(w0 + m.clientX - x0, w0));
      onSize(px, false);
    };
    const done = (u: globalThis.PointerEvent, keep: boolean) => {
      edge.removeEventListener("pointermove", move);
      edge.removeEventListener("pointerup", up);
      edge.removeEventListener("pointercancel", cancel);
      edge.removeAttribute("data-dragging");
      edgeIsHeld = false;
      if (edge.hasPointerCapture(u.pointerId)) edge.releasePointerCapture(u.pointerId);
      // A width is kept only from a drag that went somewhere: a press with no movement is no choice, and a cancelled one
      // has no place to have ended.
      if (keep && px !== w0) onSize(px, true);
      else onCancel();
    };
    const up = (u: globalThis.PointerEvent) => done(u, true);
    const cancel = (u: globalThis.PointerEvent) => done(u, false);
    edge.addEventListener("pointermove", move);
    edge.addEventListener("pointerup", up);
    edge.addEventListener("pointercancel", cancel);
  };
  const key = (e: KeyboardEvent<HTMLElement>) => {
    // A browser's or the system's own (Ctrl and Meta with an arrow: history, the word): not the edge's.
    if (e.ctrlKey || e.metaKey) return;
    const arrow = e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (e.altKey) {
      // Alt and an arrow: the column moves, where it may; Alt with anything else is the browser's (Alt+Left is Back).
      if (arrow && onMove) {
        e.preventDefault();
        e.stopPropagation();
        onMove(e.key === "ArrowLeft" ? -1 : 1, e.currentTarget);
      }
      return;
    }
    const step = e.shiftKey ? PL_NUDGE_BIG_PX : PL_NUDGE_PX;
    const heading = e.currentTarget.closest("th");
    const floor = Math.min(width, Math.max(min, headingFloorOf(heading)));
    let handled = true;
    if (e.key === "ArrowLeft") onSize(Math.max(floor, plClampWidth(width - step, width)), true);
    else if (e.key === "ArrowRight") onSize(plClampWidth(width + step, width), true);
    else if (e.key === "Enter" && heading) onFit(heading);
    else if (e.key === "Delete" || e.key === "Backspace") onReset();
    else handled = false;
    // A key the edge took is not the page's: Enter would open the row under the cursor, and the arrows would walk it.
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  return (
    <span
      role="slider"
      aria-orientation="horizontal"
      aria-label={`Width of ${label}`}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={Math.max(PL_DRAG_MAX_PX, Math.round(width))}
      aria-keyshortcuts={
        onMove ? "ArrowLeft ArrowRight Enter Delete Alt+ArrowLeft Alt+ArrowRight" : "ArrowLeft ArrowRight Enter Delete"
      }
      tabIndex={0}
      className="pl-edge"
      data-testid="column-edge"
      onPointerDown={press}
      onKeyDown={key}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        const heading = e.currentTarget.closest("th");
        if (heading) onFit(heading);
      }}
    />
  );
}

/** How far a cell's own words reach from its left edge, with its right padding (a Range measures a cut line whole). */
function reachOf(cell: Element): number {
  const left = cell.getBoundingClientRect().left;
  const pad = parseFloat(getComputedStyle(cell).paddingRight) || 0;
  const words = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  let right = left;
  for (let n = words.nextNode(); n; n = words.nextNode()) {
    if (!n.textContent || !n.textContent.trim()) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    right = Math.max(right, r.getBoundingClientRect().right);
  }
  return right - left + pad;
}

/** The least a column is dragged to: its heading's words and caret whole, so no heading reads "FIRST CONTA". */
export const headingFloorOf = (heading: Element | null): number => (heading ? Math.ceil(reachOf(heading)) + 2 : 0);

/** One canvas for every measure of words in a font, made the first time a fit asks. */
let measuring: CanvasRenderingContext2D | null = null;
const wordsWidth = (text: string, font: string): number => {
  measuring ??= document.createElement("canvas").getContext("2d");
  if (!measuring) return 0;
  measuring.font = font;
  return measuring.measureText(text).width;
};

/**
 * What a column needs to show everything it holds: the widest of its heading and its cells, each as far as its own words
 * reach from the cell's left edge (reachOf), with the cell's right padding. A cell's box is no measure: a block in it spans
 * the cell however little it says.
 *
 * `texts`, what each row's cell says (the column's file words, row by row), measures the rows the window has not drawn:
 * only about twenty rows of three hundred are in the DOM, so a fit was as wide as the rows on screen, and another scroll
 * fitted another width. Each row's words are measured in the cells' font, and what a drawn cell adds to its words (a pill's
 * dot, a face, its padding) is added to them.
 */
export function fitWidthOf(heading: HTMLElement, texts: readonly string[] | null = null): number {
  const table = heading.closest("table");
  if (!table) return 0;
  const at = (heading as HTMLTableCellElement).cellIndex + 1;
  // The heading is measured as a cell is: its words and its caret, then the padding that keeps them off the edge.
  let best = reachOf(heading);
  let extra = 0;
  let font = "";
  for (const td of table.querySelectorAll<HTMLElement>(`tbody tr[id] > td:nth-child(${at})`)) {
    const reach = reachOf(td);
    best = Math.max(best, reach);
    if (!texts) continue;
    font ||= getComputedStyle(td.querySelector("span, a, button") ?? td).font;
    const said = texts[Number(td.parentElement?.getAttribute("data-index"))];
    if (said) extra = Math.max(extra, reach - wordsWidth(said, font));
  }
  if (texts && font) for (const said of texts) if (said) best = Math.max(best, wordsWidth(said, font) + extra);
  return Math.ceil(best) + 2;
}
