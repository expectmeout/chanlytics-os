/**
 * A table's rows rise in as the table arrives, as the Inbox's and Conversations' rows do (components.css, the entrance
 * stagger on `rise-in`): the first twelve, a beat apart, once, on the draw that mounts the table. People's, Leads' and
 * the Pipeline's rows came in at once while the Inbox's tabs drew theirs in, and a scope switch read as a page swapped
 * rather than a list arriving (5 Oct 2026). Rows drawn after the first (the budget's next three hundred, a refresh, a
 * rail pick) come as they are: the list's own swap rise answers a pick (use-swap-motion.ts). The web animations API on
 * the rows themselves, `backwards`, so a row waits unseen for its turn, and nothing is left on it after. Not under
 * reduced motion, and not for a list coming back from under the row it opened (held-list.ts): it is where it was left, as
 * the screen showed it under that row's page, and React's Activity, which kept People's scope as a person stood over it,
 * draws it as a mount again (Ruben, 20 Oct 2026: every row faded up 4px as the person went).
 */
import { useLayoutEffect, useRef } from "react";
import { cameBack } from "./held-list";

/** The rise: as the house's `rise-in` (kit.css), twelve rows, each 30 ms after the one above, the eighth on at once. */
const RISE_PX = 4;
const RISE_MS = 260;
const STEP_MS = 30;
const STEPS = 8;
const FIRST = 12;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** The parts of a table that `riseRows` reads: its row groups' rows, each able to animate. */
interface RisingTable {
  querySelectorAll(selector: string): ArrayLike<{ animate?: Element["animate"] }>;
}

/** Whether the person has asked for less motion, where the browser can say. */
const lessMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Rise the first rows of a table in, one after another. Answers how many it moved. */
export function riseRows(table: RisingTable): number {
  if (lessMotion()) return 0;
  const rows = Array.from(table.querySelectorAll(":scope > tbody > tr")).slice(0, FIRST);
  let moved = 0;
  rows.forEach((tr, i) => {
    if (typeof tr.animate !== "function") return;
    tr.animate(
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

/** The ref for the table's element: its first rows rise in on the draw that mounts it. */
export function useRowsArrive<T extends HTMLElement = HTMLTableElement>() {
  const table = useRef<T | null>(null);
  useLayoutEffect(() => {
    if (table.current && !cameBack(table.current)) riseRows(table.current);
  }, []);
  return table;
}
