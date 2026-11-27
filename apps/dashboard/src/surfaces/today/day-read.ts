/**
 * Today's own read, as the cards beside the day hear it: Cold email's one line (zones/cold-email-note.tsx) and Content's
 * (content-note.tsx), each a read of its own. Each is asked as the card is drawn, and again only once Today's own read has
 * landed having begun after it, since that is when the frame heard something: a notice of what Today draws, a write read
 * again behind it, the fifteen-minute heal, the day's turn, the network or the tab come back. Never for the clock's
 * minute remake of the day from what it holds (override.ts `rederive`, hearing/clock.ts), which asks the server nothing
 * and moves the day's surface all the same. The cards read again on every move of it, at most once a minute, so a Today
 * left open in front read both notes again once or twice in two minutes for nothing: 17 database calls a minute against
 * the nightly's line of 12 (e2e/shell/database-calls.spec.ts, run 45931523493, 27 Nov 2026).
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { MIN_MS } from "@chanlytics/contracts";
import { hearFront, pageHidden } from "@/bridge/hearing/front";
import { onSurfaceMoved, surfaceMoved, surfaceVersion } from "@/bridge/surface-status";
import { letsGo } from "@/client/trouble";

/** The signal Today's own read says as it lands (surface-status surfaceMoved): never the clock's remake of the day. */
const DAY_READ = "today_read";

/** When the newest of Today's own reads to land began, by this browser's clock; 0 before any. */
let dayReadBegan = 0;

/**
 * Today's own read landed, begun at `began` (override.ts `apply`). The load's, which the document's head started beside the
 * cards' own reads, is not said: the cards read with it.
 */
export function dayWasRead(began: number): void {
  dayReadBegan = Math.max(dayReadBegan, began);
  surfaceMoved(DAY_READ);
}

const hearDayRead = (fn: () => void) => onSurfaceMoved([DAY_READ], fn);
const dayReadsHeard = () => surfaceVersion([DAY_READ]);

/** `ask` once `waitMs` has passed and the page is in front: a read due while nobody looks waits for them. Answers the stop. */
function askLater(waitMs: number, ask: () => void): () => void {
  let unfront: (() => void) | null = null;
  const inFront = () => {
    if (!pageHidden()) return ask();
    unfront = hearFront(() => {
      if (pageHidden()) return;
      unfront?.();
      unfront = null;
      ask();
    });
  };
  const stop = () => unfront?.();
  if (waitMs <= 0) {
    inFront();
    return stop;
  }
  const timer = setTimeout(inFront, waitMs);
  // A test's process is not kept alive by a card's wait alone (a browser's timer is a number, with none).
  const handle: unknown = timer;
  if (letsGo(handle)) handle.unref();
  return () => {
    clearTimeout(timer);
    stop();
  };
}

/**
 * A card's own read beside the day: asked as the card is drawn, and again where Today's own read has landed having begun
 * after the card last asked, at most once a minute. One due inside the minute is asked as the minute ends, never let go,
 * since what Today heard may be the card's too (a mailbox, a run, the business's settings); and one due while nobody looks
 * as the page comes in front. `take` is handed each answer, null where the read failed or was refused.
 */
export function useReadAsTheDayIsRead<T>(read: () => Promise<T | null>, take: (value: T | null) => void): void {
  const heard = useSyncExternalStore(hearDayRead, dayReadsHeard, dayReadsHeard);
  const askedAt = useRef<number | null>(null);
  const due = useRef<(() => void) | null>(null);
  useEffect(() => {
    const ask = () => {
      askedAt.current = Date.now();
      void read().then(take);
    };
    if (askedAt.current === null) return ask();
    // Asked since the day was read, or asked for already: nothing more.
    if (dayReadBegan <= askedAt.current || due.current) return;
    let asked = false;
    const stop = askLater(askedAt.current + MIN_MS - Date.now(), () => {
      asked = true;
      due.current = null;
      ask();
    });
    if (!asked) due.current = stop;
  }, [heard, read, take]);
  // A card no longer drawn asks nothing it was due.
  useEffect(
    () => () => {
      due.current?.();
      due.current = null;
    },
    [],
  );
}
