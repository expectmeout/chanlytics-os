/**
 * When the one celebration is owed (Working for you, W6; the review of 22 Nov 2026). The last who waited was answered
 * here, and nobody waits now: the card's room says "Nothing needs you." for a beat before the next thing takes the card.
 * It used to stand only where nothing followed, and something nearly always does (a to-do, the week, setting up, what AI
 * found), so it was almost never seen.
 *
 * Owed only where a hand did it: the card held someone waiting, a hand pressed something on the page or over it a moment
 * ago (the card's own press, a reply's Send in its sheet), and the count is none. A read that moves the card by itself (a
 * teammate answered, the day closed) owes nothing. While anything is open over the page it is held, and stands once the
 * hand is free, so it is never said behind a sheet (W23). Someone new arriving ends it at once. With less motion asked for
 * it is left out: the head has said it.
 */
import { useEffect, useState } from "react";
import type { TodayArrangement } from "../arrangement";
import { useHandsBusy } from "./held";
import { CLEARED_BEAT_MS, cardPressedLately, handPressed, handPressedLately, motionStill } from "./motion";

/** The celebration as the page draws it: held while a hand is busy, on for its beat, or none. */
export type ClearedBeat = "held" | "on" | null;

/** How long after the card let a waiting person go the count may take to say nobody waits: its own next draw. */
const LEFT_HOLDS_MS = 1500;

type Holder = NonNullable<TodayArrangement["card"]>["holder"];
const waited = (holder: Holder | null): boolean => holder === "queue" || holder === "wait";

/** What the last draw held, and when the card let a waiting person go (0 where it has not, or it was answered for). */
interface Drawn {
  holder: Holder | null;
  waiting: boolean;
  leftAt: number;
}

/** The celebration, from the arrangement as it is drawn: what the page shows in the card's place while it is owed. */
export function useClearedBeat(at: Pick<TodayArrangement, "card" | "waiting">): ClearedBeat {
  const busy = useHandsBusy();
  const holder = at.card?.holder ?? null;
  const waiting = at.waiting;
  const [owed, setOwed] = useState(false);
  const [drawn, setDrawn] = useState<Drawn>({ holder, waiting, leftAt: 0 });
  // A hand on the page or over it: heard as it goes down, wherever it lands.
  useEffect(() => {
    document.addEventListener("pointerdown", handPressed, true);
    document.addEventListener("keydown", handPressed, true);
    return () => {
      document.removeEventListener("pointerdown", handPressed, true);
      document.removeEventListener("keydown", handPressed, true);
    };
  }, []);
  // Decided as the page is drawn, from what the last draw held (React's own way to keep it), and never in an effect: the
  // page is drawn again at once, before any part of it, so the card's room is the celebration's from its first frame and
  // the next card is never drawn ahead of it.
  if (drawn.holder !== holder || drawn.waiting !== waiting) {
    const leftAt = waited(drawn.holder) && !waited(holder) ? Date.now() : drawn.leftAt;
    const quiet = !waited(holder) && !waiting;
    const justLeft = quiet && leftAt > 0 && Date.now() - leftAt < LEFT_HOLDS_MS;
    setDrawn({ holder, waiting, leftAt: justLeft ? 0 : leftAt });
    if (!quiet) setOwed(false);
    else if (justLeft && (cardPressedLately() || handPressedLately()) && !motionStill()) setOwed(true);
  }
  const on = owed && !busy;
  useEffect(() => {
    if (!on) return undefined;
    const timer = setTimeout(() => setOwed(false), CLEARED_BEAT_MS);
    return () => clearTimeout(timer);
  }, [on]);
  if (!owed) return null;
  return on ? "on" : "held";
}
