/**
 * How many rows a table draws (moved whole from legacy/pages/people-table.jsx usePlRowWindow, decision 0015). A long
 * list draws a window of its rows, not all of them: the first rows only (PL_FIRST_ROWS), a few screens of them a frame
 * later (PL_NEAR_ROWS) and the rest of the window once the page is idle, grown by a step each time the window's foot
 * (#pl-foot) comes within a screen's height of the screen, and to
 * reach a row the cursor walks to (`reach(index)`). A table in sections draws every row (`windowed` false: the
 * Pipeline's groups), and so does a browser that cannot watch a foot.
 */
import { useEffect, useState } from "react";

/** How long a tab that gets no animation frame (in the background) waits before its rows are lifted all the same. */
const BACKGROUND_BEAT_MS = 120;
/** How long the rest of a window waits for an idle moment before it is drawn all the same. */
const IDLE_WAIT_MS = 1500;
/** Where a browser has no idle callback (Safari), how long the rest of a window waits instead. */
const IDLE_FALLBACK_MS = 400;

/** The rows a fresh mount draws first; the page lifts the budget a frame later. */
export const PL_FIRST_ROWS = 24;
/** A long list draws this many rows once the first frame is out: a few screens. */
export const PL_NEAR_ROWS = 100;
/** And this many once the page is idle, and this many more each time its foot comes near. */
export const PL_WINDOW_ROWS = 300;
export const PL_WINDOW_STEP = 200;

/** The nearest ancestor that scrolls, which a watcher of an element in it takes for its root; null is the page's viewport. */
const plScrollParent = (el: HTMLElement): HTMLElement | null => {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const over = window.getComputedStyle(n).overflowY;
    if (over === "auto" || over === "scroll") return n;
  }
  return null;
};

/** Run `fn` once the next frame is painted (a frame, then a task); at once where there are no frames. The answer cancels it. */
const plAfterPaint = (fn: () => void): (() => void) => {
  if (typeof requestAnimationFrame !== "function") {
    fn();
    return () => undefined;
  }
  let task: ReturnType<typeof setTimeout> | null = null;
  const frame = requestAnimationFrame(() => {
    task = setTimeout(fn, 0);
  });
  return () => {
    cancelAnimationFrame(frame);
    if (task !== null) clearTimeout(task);
  };
};

/** Run `fn` when the page is idle, or after IDLE_WAIT_MS at most; after a beat where there is no idle callback. The answer cancels it. */
const plWhenIdle = (fn: () => void): (() => void) => {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(fn, { timeout: IDLE_WAIT_MS });
    return () => cancelIdleCallback(id);
  }
  const task = setTimeout(fn, IDLE_FALLBACK_MS);
  return () => clearTimeout(task);
};

/** What a page kept of a view: a cursor and a scroll, to be put back. */
interface Placed {
  top?: unknown;
  cursor?: unknown;
}

/**
 * The rows a fresh mount draws first: the first few; where a place is to be put back, enough to reach it -- a step
 * past the cursor's row, and a step past what the scroll's height holds at 40px a row; and every row of a table in sections.
 */
const plStartRows = (place: Placed | null, windowed: boolean, ids: readonly string[]): number => {
  if (!place || !(place.top || place.cursor)) return PL_FIRST_ROWS;
  if (!windowed) return Infinity;
  return Math.max(
    PL_WINDOW_ROWS,
    ids.indexOf(place.cursor as string) + PL_WINDOW_STEP,
    Math.ceil(((place.top as number) || 0) / 40) + PL_WINDOW_STEP,
  );
};

export function usePlRowWindow({
  place,
  windowed,
  ids,
  cursor,
}: {
  place: Placed | null;
  windowed: boolean;
  ids: readonly string[];
  cursor: string | null;
}): { budget: number; reach: (index: number) => void } {
  const count = ids.length;
  const [budget, setBudget] = useState(() => plStartRows(place, windowed, ids));
  useEffect(() => {
    if (budget === Infinity) return undefined;
    const lift = (to: number) => setBudget((b) => (windowed ? Math.max(b, to) : Infinity));
    if (typeof requestAnimationFrame !== "function") {
      lift(PL_WINDOW_ROWS);
      return undefined;
    }
    // A few screens the next frame, or a beat: a tab in the background gets no frames, and its rows must not wait for one.
    // The rest of the window once the page is idle: drawn at once, the window was most of a switch's work after its first
    // paint (at 200 rows, 0.7 s of style and layout on a 4x-slowed CPU, 5 Oct 2026), with the person waiting on it.
    let idle: (() => void) | null = null;
    const near = () => {
      lift(PL_NEAR_ROWS);
      idle ??= plWhenIdle(() => lift(PL_WINDOW_ROWS));
    };
    const frame = requestAnimationFrame(near);
    const beat = setTimeout(near, BACKGROUND_BEAT_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(beat);
      idle?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (budget >= count || !document.getElementById) return undefined;
    const foot = document.getElementById("pl-foot");
    if (!foot) return undefined;
    if (typeof IntersectionObserver !== "function") {
      setBudget(Infinity);
      return undefined;
    }
    // Watched from inside the box that scrolls it, whose clip a margin on the page's own viewport does not widen.
    let watch: IntersectionObserver | null = null;
    const start = () => {
      watch = new IntersectionObserver(
        (seen) => {
          if (seen.some((s) => s.isIntersecting)) setBudget((b) => b + PL_WINDOW_STEP);
        },
        { root: plScrollParent(foot), rootMargin: "800px 0px" },
      );
      watch.observe(foot);
    };
    // Once the rows just drawn are painted: finding the box that scrolls reads each ancestor's style, which right after
    // three hundred new rows styled the whole page again first (84 ms of a switch to Leads at 4x CPU, 5 Oct 2026).
    const later = plAfterPaint(start);
    return () => {
      later();
      if (watch) watch.disconnect();
    };
  }, [budget, count]);
  // The cursor's row is drawn wherever the cursor came from: a sort that moved it, a view's kept place, a deep link. No
  // cursor reaches nothing: it read as the row before the first, and drew 199 rows the moment a table was first painted.
  useEffect(() => {
    const at = cursor === null ? -1 : ids.indexOf(cursor);
    if (at >= 0) setBudget((b) => Math.max(b, at + PL_WINDOW_STEP));
  }, [cursor, ids]);
  return { budget, reach: (index) => setBudget((b) => Math.max(b, index + PL_WINDOW_STEP)) };
}
