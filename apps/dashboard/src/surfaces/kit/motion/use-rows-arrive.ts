/**
 * A list's first rows rise in as the list arrives, on the house's one entrance (kit.css rise-in): the first twelve, a
 * beat apart, once, on the draw that first puts the list in the page. People's, Leads' and the Pipeline's rows came in at
 * once while the Inbox's tabs drew theirs in, and a scope switch read as a page swapped rather than a list arriving (5 Oct
 * 2026). The Inbox's and Conversations' rows rose on a stylesheet's entrance instead (components.css), every row as it was
 * drawn: once a list drew only the rows near the screen (kit/rows/shown-rows.ts), a row the window drew as the list was
 * scrolled came in from nothing, see-through for a beat, so on a phone a flick drew rows with no line between them (Ruben,
 * 21 Oct 2026). Rows drawn after the first (the window's as the list is scrolled, the budget's next three hundred, a
 * refresh, a rail pick) come as they are: the list's own swap rise answers a pick (use-swap-motion.ts). The web animations
 * API on the rows themselves, `backwards`, so a row waits unseen for its turn, and nothing is left on it after. Not under
 * reduced motion, and not for a list coming back from under the row it opened (held-list.ts): it is where it was left, as
 * the screen showed it under that row's page, and React's Activity, which kept People's scope as a person stood over it,
 * draws it as a mount again (Ruben, 20 Oct 2026: every row faded up 4px as the person went).
 */
import { useCallback, useRef } from "react";
import { cameBack } from "./held-list";

/** The rise: as the house's `rise-in` (kit.css), twelve rows, each 30 ms after the one above, the eighth on at once. */
const RISE_PX = 4;
const RISE_MS = 260;
const STEP_MS = 30;
const STEPS = 8;
const FIRST = 12;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
/** A table's rows: those of its own row groups, never a nested table's. */
const TABLE_ROWS = ":scope > tbody > tr";

/** The parts of a list that `riseRows` reads: its rows, each able to animate. */
interface RisingList {
  querySelectorAll(selector: string): ArrayLike<{ animate?: Element["animate"] }>;
}

/** Whether the person has asked for less motion, where the browser can say. */
const lessMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Rise the first rows of a list in, one after another: a table's own rows, or the rows `rows` names (the Inbox's
 * `.ix-thread`, Conversations' `.cv-row`). Answers how many it moved.
 */
export function riseRows(list: RisingList, rows: string = TABLE_ROWS): number {
  if (lessMotion()) return 0;
  const first = Array.from(list.querySelectorAll(rows)).slice(0, FIRST);
  let moved = 0;
  first.forEach((row, i) => {
    if (typeof row.animate !== "function") return;
    row.animate(
      [
        { opacity: 0, transform: `translateY(${RISE_PX}px)` },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: RISE_MS,
        delay: Math.min(i, STEPS) * STEP_MS,
        easing: EASE_OUT,
        fill: "backwards",
      },
    );
    moved += 1;
  });
  return moved;
}

/**
 * The ref for the list's element: its first rows rise in on the draw that first puts it in the page, and never again on
 * that page (a draw that puts it back, held-list.ts, is no arrival either). `rows` names a list's own rows where they
 * are not a table's.
 */
export function useRowsArrive<T extends HTMLElement = HTMLTableElement>(
  rows: string = TABLE_ROWS,
): (el: T | null) => void {
  const arrived = useRef(false);
  return useCallback(
    (el: T | null) => {
      if (!el || arrived.current) return;
      arrived.current = true;
      if (!cameBack(el)) riseRows(el, rows);
    },
    [rows],
  );
}
