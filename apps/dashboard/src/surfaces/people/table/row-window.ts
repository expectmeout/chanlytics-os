/**
 * How many rows a table draws (moved whole from legacy/pages/people-table.jsx usePlRowWindow, decision 0015). A long
 * list draws a window of its rows, not all of them: the first rows only (PL_FIRST_ROWS) and a window of them a frame
 * later, grown by a step each time the window's foot (#pl-foot) comes within a screen's height of the screen, and to
 * reach a row the cursor walks to (`reach(index)`). A table in sections draws every row (`windowed` false: the
 * Pipeline's groups), and so does a browser that cannot watch a foot.
 */
import { useEffect, useState } from "react";

/** How long a tab that gets no animation frame (in the background) waits before its rows are lifted all the same. */
const BACKGROUND_BEAT_MS = 120;

/** The rows a fresh mount draws first; the page lifts the budget a frame later. */
export const PL_FIRST_ROWS = 24;
/** A long list draws this many rows once the first frame is out, and this many more each time its foot comes near. */
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
    const lift = () => setBudget((b) => (windowed ? Math.max(b, PL_WINDOW_ROWS) : Infinity));
    if (typeof requestAnimationFrame !== "function") {
      lift();
      return undefined;
    }
    // The next frame, or a beat: a tab in the background gets no frames, and its rows must not wait for one.
    const frame = requestAnimationFrame(lift);
    const beat = setTimeout(lift, BACKGROUND_BEAT_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(beat);
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
    const watch = new IntersectionObserver(
      (seen) => {
        if (seen.some((s) => s.isIntersecting)) setBudget((b) => b + PL_WINDOW_STEP);
      },
      { root: plScrollParent(foot), rootMargin: "800px 0px" },
    );
    watch.observe(foot);
    return () => watch.disconnect();
  }, [budget, count]);
  // The cursor's row is drawn wherever the cursor came from: a sort that moved it, a view's kept place, a deep link.
  useEffect(() => {
    setBudget((b) => Math.max(b, (cursor === null ? -1 : ids.indexOf(cursor)) + PL_WINDOW_STEP));
  }, [cursor, ids]);
  return { budget, reach: (index) => setBudget((b) => Math.max(b, index + PL_WINDOW_STEP)) };
}
