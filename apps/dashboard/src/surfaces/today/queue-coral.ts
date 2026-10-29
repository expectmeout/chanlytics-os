/**
 * Who holds Today's coral: Need you's first open row's act (pages/queue.tsx `verbKind`), else, on a phone, To do's first
 * act (pages/phone-todo.tsx), else the setup card. One coral a screen. The queue's rows are more than what needs you
 * counts (a step due, a visit to mark, a run waiting for a word), so the card stood coral beside the queue's Answer while
 * the count said none (27 Oct 2026); on a phone the steps and the visits are To do's (the phone canvas, 28 Oct 2026), which
 * takes the coral only where Need you holds none. Each says it as it draws; the others hear it.
 */
import { useEffect, useState } from "react";

/** What may hold the coral before the setup card: Need you, and To do on a phone. */
type CoralHolder = "queue" | "todo";

const held = new Set<CoralHolder>();
const hearing = new Set<() => void>();

/** A holder drew (or let go of) the coral. */
export function holdsCoral(who: CoralHolder, on: boolean): void {
  if (on === held.has(who)) return;
  if (on) held.add(who);
  else held.delete(who);
  for (const hear of hearing) hear();
}

/** The queue drew (or let go of) the coral. */
export function queueHoldsCoral(on: boolean): void {
  holdsCoral("queue", on);
}

/** Whether `who` holds the coral now (any holder, unnamed), redrawn when that changes. */
export function useCoralHeld(who?: CoralHolder): boolean {
  const now = () => (who ? held.has(who) : held.size > 0);
  const [on, setOn] = useState(now);
  useEffect(() => {
    const hear = () => setOn(now());
    hearing.add(hear);
    hear();
    return () => {
      hearing.delete(hear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` reads `who`, the one thing it hangs on
  }, [who]);
  return on;
}

/** Whether anything before the setup card holds the coral now: the card is then the quiet kind. */
export function useQueueHoldsCoral(): boolean {
  return useCoralHeld();
}
