/**
 * Whether Today's queue holds the page's coral: its first open row's act (pages/queue.tsx `verbKind`). The setup card
 * above it is then the quiet kind, one coral a screen. The queue's rows are more than what needs you counts (a step due,
 * a visit to mark, a run waiting for a word), so the card stood coral beside the queue's Answer while the count said none
 * (27 Oct 2026). The queue says it as it draws; the card hears it.
 */
import { useEffect, useState } from "react";

let coralHeld = false;
const hearing = new Set<(on: boolean) => void>();

/** The queue drew (or let go of) the coral. */
export function queueHoldsCoral(on: boolean): void {
  if (on === coralHeld) return;
  coralHeld = on;
  for (const hear of hearing) hear(on);
}

/** Whether the queue holds the coral now, redrawn when that changes. */
export function useQueueHoldsCoral(): boolean {
  const [on, setOn] = useState(coralHeld);
  useEffect(() => {
    hearing.add(setOn);
    setOn(coralHeld);
    return () => {
      hearing.delete(setOn);
    };
  }, []);
  return on;
}
