/**
 * How a chart is sized and how it is read from the keyboard and the pointer (moved whole from
 * legacy/components/chart-core.jsx, decision 0015).
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";

// The box a chart is given, measured, so it draws in real pixels; 600 wide until the first measure. The height is
// only wanted by a chart told to fill, and is 0 until measured, which is what `ckHeight` reads as "use the floor".
export function useChartWidth(initial = 600): [RefObject<HTMLDivElement | null>, number, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: initial, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.round(r.width));
      const h = Math.max(0, Math.round(r.height));
      // The same box is the same state: a resize that changes neither redraws nothing.
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    set();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box.w, box.h];
}

/** What a chart spreads onto its root to be one tab stop the arrow keys walk. */
export interface ChartKeys {
  tabIndex: 0;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

// One tab stop per chart. Focus lands on `start` (the newest day by default), the arrows move one at a time, Home and
// End go to the ends, Escape lets go. A point held across a period change that no longer exists reads as none. (A
// stop per day was 270 unnamed stops at 90 days.)
export function useChartNav(
  n: number,
  { start = n - 1 }: { start?: number } = {},
): [number | null, (i: number | null) => void, ChartKeys] {
  const [held, setActive] = useState<number | null>(null);
  const active = held !== null && held < n ? held : null;
  const first = Math.max(0, Math.min(n - 1, start));
  const keys: ChartKeys = {
    tabIndex: 0,
    onFocus: () => setActive((a) => (a === null || a >= n ? first : a)),
    onBlur: () => setActive(null),
    onKeyDown: (e) => {
      if (e.key === "Escape") {
        setActive(null);
        return;
      }
      const at = active === null ? first : active;
      const to =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? at + 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? at - 1
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? n - 1
                : null;
      if (to === null) return;
      e.preventDefault();
      setActive(Math.max(0, Math.min(n - 1, to)));
    },
  };
  return [active, setActive, keys];
}

/** The pointer as the keyboard's twin: a mouse that leaves lets go; a finger's point stays until the next touch. */
export const ckPointer = (
  setActive: (i: number | null) => void,
  at: (e: PointerEvent<HTMLDivElement>) => number | null,
) => ({
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => setActive(at(e)),
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => setActive(at(e)),
  onPointerLeave: (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") setActive(null);
  },
});
