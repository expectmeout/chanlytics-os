/**
 * A row that comes into a card where there was none opens, its height and its fade together, rather than pushing what is under it down
 * at once: the shelves that arrive with a first batch of photos. A card gliding its own height (use-height-glide.ts) is told to follow it
 * frame by frame, as it follows a box rising with a phone's keys, or it would glide to the row's first frame and jump to the rest. The web
 * animations API on the row itself, so nothing is left on it after, and not under reduced motion.
 */
import { useCallback } from "react";

/** How long a row takes to open: as long as a card's height glides. */
const OPEN_MS = 220;

/** A row opens once: its second hand-over (React's strict mode gives a ref each element twice) would measure it shut. */
const rowsOpened = new WeakSet<HTMLElement>();

/** Open a row where it now stands, on the house's ease-out, read off the row as a card's glide reads it. */
function letRowOpen(row: HTMLElement): void {
  if (rowsOpened.has(row) || typeof row.animate !== "function") return;
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  rowsOpened.add(row);
  const card = row.closest<HTMLElement>("[data-glides]");
  card?.setAttribute("data-rising", "");
  const easing = getComputedStyle(row).getPropertyValue("--ease-out").trim() || "ease-out";
  const run = row.animate(
    [
      { height: "0px", opacity: 0 },
      { height: `${row.offsetHeight}px`, opacity: 1 },
    ],
    { duration: OPEN_MS, easing },
  );
  const done = () => card?.removeAttribute("data-rising");
  run.onfinish = done;
  run.oncancel = done;
}

/** A callback ref for a row that may come later: it opens as it is first drawn, where `wanted` says this page saw it come. */
export function useRowOpens(wanted: boolean): (row: HTMLElement | null) => void {
  return useCallback(
    (row: HTMLElement | null) => {
      if (row && wanted) letRowOpen(row);
    },
    [wanted],
  );
}
