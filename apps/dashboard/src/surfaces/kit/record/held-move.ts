/**
 * A move off the page, held while the page holds a change not saved (the interaction review's Part 6, 13 Nov 2026).
 *
 * The sidebar, the account menu, a ⌘ key, a link inside the app, Settings' rail (bridge/workspace.ts goToRoute) and Back
 * and Forward (guardLeaving there) each ask holdMove before the page goes: the frame's question hands it over as it mounts
 * (leave-ask.tsx LeaveHost), since the bridge loads nothing of the surfaces'. It looks at the open fold alone
 * (kit/record/registry.ts): a fold's changes go with its page, where a composer's words are kept in the tab and come back
 * with it (work.tsx), so they are never asked about here. With nothing to lose, the move goes at once. A change not saved
 * holds the move and asks "Leave without saving?" (LeaveHost); "Yes, leave" throws the change away and makes the move,
 * "Stay" keeps the page. A save that is out is never asked about: the move waits for the save's answer, as the registry has
 * a fold asked for wait, and the answer is the answer. Taken, the fold closes and the move goes by itself; refused, the
 * change is not saved after all, and the question is asked. The registry tells its listeners when a fold closes, not when a
 * save is refused, so the wait looks again every SAVE_LOOK_MS too; a write is given up on in 30 s (client/api.ts), so it
 * ends.
 *
 * One move is held at a time: a second asked while one is held takes its place, and one asked with nothing left to lose
 * goes, and lets the held one go with its question.
 */
import { recFolds } from "./registry";

/** How often a move waiting for a save looks whether the save has answered. */
const SAVE_LOOK_MS = 100;

interface HeldMove {
  go: () => void;
  asking: boolean;
}

let moveHeld: HeldMove | null = null;
let endWait: (() => void) | null = null;
const heldHearers = new Set<() => void>();

const sayHeld = () => {
  for (const fn of [...heldHearers]) fn();
};

const stopWaiting = () => {
  endWait?.();
  endWait = null;
};

/** The held move let go of, and its question with it: the move, for the caller to make or drop. */
function letMoveGo(): HeldMove | null {
  const was = moveHeld;
  moveHeld = null;
  stopWaiting();
  sayHeld();
  return was;
}

/** A save's answer: taken, the move goes; refused, the change is not saved, and the question is asked. */
function afterTheSave(): void {
  if (!moveHeld || moveHeld.asking || recFolds.saving()) return;
  if (recFolds.foldDirty()) {
    stopWaiting();
    moveHeld = { go: moveHeld.go, asking: true };
    sayHeld();
  } else letMoveGo()?.go();
}

/**
 * Ask before a move off the page (`go`, the move itself): false when nothing would be lost, and the caller moves now;
 * true when the move is held, and `go` is made once the person says "Yes, leave", or once a save that is out is taken.
 */
export function holdMove(go: () => void): boolean {
  const saving = recFolds.saving();
  if (!saving && !recFolds.foldDirty()) {
    if (moveHeld) letMoveGo();
    return false;
  }
  stopWaiting();
  moveHeld = { go, asking: !saving };
  if (saving) {
    const looking = setInterval(afterTheSave, SAVE_LOOK_MS);
    const unhear = recFolds.subscribe(afterTheSave);
    endWait = () => {
      clearInterval(looking);
      unhear();
    };
  }
  sayHeld();
  return true;
}

/** Whether a held move is asking its question now (the frame draws it while it is). */
export const leaveAsking = (): boolean => moveHeld?.asking === true;

/** Hear the held move change: held, asking, answered. Answers the stop. */
export function hearHeldMove(fn: () => void): () => void {
  heldHearers.add(fn);
  return () => {
    heldHearers.delete(fn);
  };
}

/** The question answered: "Yes, leave" throws the change away and makes the move; "Stay" keeps the page as it is. */
export function answerLeave(leave: boolean): void {
  if (leave) recFolds.discard();
  const move = letMoveGo();
  if (leave) move?.go();
}
