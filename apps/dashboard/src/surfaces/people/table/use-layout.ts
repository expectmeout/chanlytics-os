/**
 * What the table is given to draw its layout: the room it has, the widths a member dragged to, how tall a row stands,
 * and the acts that change them. The page's controls call it once (hooks/use-controls.ts) and hand the table its
 * answer, so the table stays hookless and the three scopes (People, Leads, the Pipeline) get one layout, not three.
 *
 * The room is the width of the table's own box, read as it is drawn and again whenever the box or the table in it changes
 * (a window, the sidebar, the rail, a column), by a callback ref that sets it before the first paint, so the columns never
 * draw at one width and jump to another. A drag changes only a live width, which the headings follow; the choice reaches
 * the view that is saved when the drag ends.
 */
import { useCallback, useRef, useState } from "react";
import type { Density, LayoutChoices } from "./layout";
import { plMoved, plMovedTo, plSizing } from "./layout";

export interface TableLayout {
  /** The width of the table's box, or null before it is measured. */
  available: number | null;
  /** The widths a member dragged to, with the one under way. */
  widths: Readonly<Record<string, number>>;
  density: Density;
  /** On the element that scrolls the table, so its room is known. */
  scrollRef: (el: HTMLDivElement | null) => void;
  /**
   * A column's width: live while a drag is under way (`commit` false) and final when it ends. `frozen`, the widths every
   * column stands at now: while nobody has sized a column they share the box, and the first width set keeps the others
   * where they stand (layout.ts plFrozenWidths), so nothing but the edge in hand moves.
   */
  onSize: (key: string, px: number, commit: boolean, frozen?: Readonly<Record<string, number>>) => void;
  /** A drag that ended with no width to keep: its live width goes. */
  onCancel: () => void;
  /** Give one column back its declared width. */
  onReset: (key: string) => void;
  /** A column one place earlier or later among those a member may move, or to where another stands. */
  onMove: (key: string, by: -1 | 1) => void;
  onMoveTo: (key: string, target: string) => void;
  /** How tall a row stands. */
  onDensity: (density: Density) => void;
  /** Whether any width or place differs from the page's own, and the way back to all of them. */
  changed: boolean;
  onResetAll: () => void;
  /**
   * Every column the width of what it holds: the table measures them (it holds the rows and what each cell says) and
   * leaves the measure here as it draws, and the Columns menu asks for it.
   */
  measurer: { current: ((table: HTMLTableElement) => Record<string, number>) | null };
  onFitAll: () => void;
}

interface LayoutArgs {
  columns: readonly { key: string; pinned?: boolean; fixed?: boolean }[];
  choices: LayoutChoices;
  setChoices: (update: (c: LayoutChoices) => LayoutChoices) => void;
  /** Say the member changed the view, so what they chose is saved and the workspace's copy is not taken over it. */
  touch: () => void;
}

/** Whether the box can be scrolled further right, said on the box (`data-more`), so its right edge draws a line. */
export const plMarkMore = (el: HTMLElement): void => {
  el.toggleAttribute("data-more", el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
};

export function usePlColumnLayout({ columns, choices, setChoices, touch }: LayoutArgs): TableLayout {
  const [available, setAvailable] = useState<number | null>(null);
  const [live, setLive] = useState<Record<string, number> | null>(null);
  const watching = useRef<ResizeObserver | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const measurer = useRef<((table: HTMLTableElement) => Record<string, number>) | null>(null);
  const scrollRef = useCallback((el: HTMLDivElement | null) => {
    if (watching.current) watching.current.disconnect();
    watching.current = null;
    box.current = el;
    if (!el) return;
    const read = () => {
      setAvailable(el.clientWidth > 0 ? el.clientWidth : null);
      plMarkMore(el);
    };
    read();
    if (typeof ResizeObserver === "function") {
      watching.current = new ResizeObserver(read);
      watching.current.observe(el);
      // The table too: a column dragged or turned on changes how far the box scrolls, not the box.
      const table = el.querySelector("table");
      if (table) watching.current.observe(table);
    }
  }, []);
  const sized = plSizing(columns, choices.widths) === "sized";
  // The widths a size starts from: the member's, or, while nobody has sized a column, where every column stands now.
  const from = (frozen?: Readonly<Record<string, number>>) =>
    sized || !frozen ? choices.widths : { ...choices.widths, ...frozen };
  const onSize = (key: string, px: number, commit: boolean, frozen?: Readonly<Record<string, number>>) => {
    if (!commit) {
      setLive({ ...from(frozen), [key]: px });
      return;
    }
    setLive(null);
    touch();
    const start = from(frozen);
    setChoices((c) => ({ ...c, widths: { ...c.widths, ...start, [key]: px } }));
  };
  const onCancel = () => setLive(null);
  const onReset = (key: string) => {
    setLive(null);
    touch();
    setChoices((c) => {
      const widths = { ...c.widths };
      delete widths[key];
      return { ...c, widths };
    });
  };
  // The order is kept for the columns a member may move that are drawn, then for the others as they stood, so a column
  // turned off and on again comes back to the place it had.
  const movable = columns.filter((c) => !c.pinned && !c.fixed).map((c) => c.key);
  const reorder = (next: string[]) => {
    // A move that changes nothing (a column at the end of its row) is no change to the view, and keeps the workspace's copy.
    if (next.length === choices.order.length && next.every((k, i) => k === choices.order[i])) return;
    touch();
    setChoices((c) => ({ ...c, order: [...next, ...c.order.filter((k) => !next.includes(k))] }));
  };
  const onFitAll = () => {
    const table = box.current?.querySelector("table");
    const fits = table && measurer.current ? measurer.current(table) : null;
    if (!fits || !Object.keys(fits).length) return;
    setLive(null);
    touch();
    setChoices((c) => ({ ...c, widths: { ...c.widths, ...fits } }));
  };
  return {
    available,
    widths: live ?? choices.widths,
    density: choices.density,
    scrollRef,
    onSize,
    onCancel,
    onReset,
    onMove: (key, by) => reorder(plMoved(choices.order, movable, key, by)),
    onMoveTo: (key, target) => reorder(plMovedTo(choices.order, movable, key, target)),
    onDensity: (density) => {
      touch();
      setChoices((c) => ({ ...c, density }));
    },
    changed: Object.keys(choices.widths).length > 0 || choices.order.length > 0,
    onResetAll: () => {
      setLive(null);
      touch();
      setChoices((c) => ({ ...c, widths: {}, order: [] }));
    },
    measurer,
    onFitAll,
  };
}
