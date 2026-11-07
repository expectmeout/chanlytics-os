/**
 * A row that comes into a card where there was none opens, its height and its fade together, rather than pushing what is under it down
 * at once: the shelves that arrive with a first batch of photos. A card gliding its own height (use-height-glide.ts) is told to follow it
 * frame by frame, as it follows a box rising with a phone's keys, or it would glide to the row's first frame and jump to the rest. The web
 * animations API on the row itself, so nothing is left on it after, and not under reduced motion.
 */
import { useCallback } from "react";

/** How long a row takes to open, and on what: the house's ease-out, as a card's height glides. */
const OPEN_MS = 220;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

const lessMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** What has opened: a row opens once, and its second hand-over (React's strict mode gives a ref each element twice) would measure it shut. */
const opened = new WeakSet<HTMLElement>();

/** Open a row where it now stands. Answers how long it takes, or 0 where it stands open at once. */
export function openRow(row: HTMLElement): number {
  if (opened.has(row) || lessMotion() || typeof row.animate !== "function") return 0;
  opened.add(row);
  const card = row.closest<HTMLElement>("[data-glides]");
  card?.setAttribute("data-rising", "");
  const run = row.animate(
    [
      { height: "0px", opacity: 0 },
      { height: `${row.offsetHeight}px`, opacity: 1 },
    ],
    { duration: OPEN_MS, easing: EASE_OUT },
  );
  const done = () => card?.removeAttribute("data-rising");
  run.onfinish = done;
  run.oncancel = done;
  return OPEN_MS;
}

/** A callback ref for a row that may come later: it opens as it is first drawn, where `wanted` says this page saw it come. */
export function useRowOpens(wanted: boolean): (row: HTMLElement | null) => void {
  return useCallback(
    (row: HTMLElement | null) => {
      if (row && wanted) openRow(row);
    },
    [wanted],
  );
}
