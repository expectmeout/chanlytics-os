/**
 * A choice's save, held until the keys settle (moved from legacy/pages/first-run.jsx, decision 0015).
 *
 * Arrow keys in a radiogroup move the choice AND change it, so arrowing past two answers to the third was three saves
 * (and, with the answer's door read-only while one was out, the second and third swallowed). The choice is shown at once
 * and saved once the keys settle (FIRST_RUN_SETTLE_MS), the last one -- and sent at once if the step goes first: Continue, Back or
 * Later within the wait must not lose what was chosen. `held` is the ref the choice is held in, so the page can take it
 * for its own press (Check's Continue sends the answer being chosen, not the one stored).
 */
import { useEffect, useRef, type RefObject } from "react";

/** How long a choice in a radiogroup waits before it is saved. */
const FIRST_RUN_SETTLE_MS = 600;

/** A choice waiting for the keys to settle: what was chosen, where there is one, and the send that saves it. */
export interface SettledEntry {
  next?: string;
  send: () => void;
}

export function useSettled(held: RefObject<SettledEntry | null>): (entry: SettledEntry) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const p = held.current;
      held.current = null;
      if (p) p.send();
    },
    // A ref: the same object on every draw, so this runs as the step goes and at no other time.
    [held],
  );
  return (entry) => {
    clearTimeout(timer.current);
    held.current = entry;
    timer.current = setTimeout(() => {
      if (held.current !== entry) return;
      held.current = null;
      entry.send();
    }, FIRST_RUN_SETTLE_MS);
  };
}
