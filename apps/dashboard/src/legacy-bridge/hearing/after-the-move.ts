/**
 * When a move of the address reads what it owes (the strips review, 18 Oct 2026). A surface never read this session is read
 * at once, since its page waits on it. One that holds a read is drawn as it stands and read again once the move's motion is
 * over (the deck's timeline): read at the press, its answer landed under the slide, and its parse and the page drawn again
 * held the frames of the move (People's book read again as People came in from Leads). A second move before then adds its
 * own, and the one read takes them all.
 */
import { getSurfaceStatuses } from "../surface-status";
import { hearAddress } from "../workspace";

/** How long a move's motion takes: the deck's timeline (kit/motion/view-deck.ts TIMELINE_MS); a test's window says 0. */
const AFTER_THE_MOVE_MS = 460;

/** Hear each move of the address: `dueAt` says what the move owes, and `read` reads it, as above. Answers the stop. */
export function hearMoves(dueAt: () => string[], read: (keys: string[]) => void, win: Window = window): () => void {
  const owed = new Set<string>();
  let later: ReturnType<typeof setTimeout> | null = null;
  const readOwed = () => {
    later = null;
    const keys = [...owed];
    owed.clear();
    read(keys);
  };
  const onMove = () => {
    const due = dueAt();
    const held = new Set(due.filter((key) => getSurfaceStatuses().get(key) === "live"));
    const now = due.filter((key) => !held.has(key));
    for (const key of held) owed.add(key);
    if (now.length) read(now);
    if (!owed.size || later !== null) return;
    const wait = (win as { __afterTheMoveMs?: number }).__afterTheMoveMs ?? AFTER_THE_MOVE_MS;
    if (wait > 0) later = setTimeout(readOwed, wait);
    else readOwed();
  };
  const unhear = hearAddress(onMove, win);
  return () => {
    unhear();
    if (later !== null) clearTimeout(later);
  };
}
