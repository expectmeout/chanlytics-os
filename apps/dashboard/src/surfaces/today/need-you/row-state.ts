/**
 * What a row of Need you has come to, kept by the row and not by the part that draws it (the phone canvas, 28 Oct 2026). On
 * a phone the same row's work is drawn on the page and in the sheet that walks the list (walk-sheet.tsx), one after the
 * other: a thread snoozed, a call said reached or a held reply stopped in the one reads so in the other, and in the row
 * kept on the page once the sheet is closed. A send counting down is the sends' own (sends.ts) and an Ask draft the
 * drafts' (drafts.ts); this keeps the rest. Kept for the visit: Today's queue lets it all go as it leaves the screen
 * (clearRowStates), as it lets go of the rows it kept.
 */
import { useCallback, useSyncExternalStore } from "react";

const states = new Map<string, unknown>();
const rowStateHearers = new Set<() => void>();

const hearRowStates = (on: () => void) => {
  rowStateHearers.add(on);
  return () => {
    rowStateHearers.delete(on);
  };
};

const tell = () => rowStateHearers.forEach((on) => on());

/**
 * A row's state, by the row's id and the state's name, as `useState` would hold it in one part: every part drawing the
 * same row reads and sets the same value. `initial` is what it is until set: a value, held stable by the caller.
 */
export function useRowState<T>(rowId: string, key: string, initial: T): [T, (next: T | ((was: T) => T)) => void] {
  const k = `${rowId}\u0000${key}`;
  const read = () => (states.has(k) ? (states.get(k) as T) : initial);
  const value = useSyncExternalStore(hearRowStates, read, () => initial);
  const set = useCallback(
    (next: T | ((was: T) => T)) => {
      const was = states.has(k) ? (states.get(k) as T) : initial;
      const now = typeof next === "function" ? (next as (was: T) => T)(was) : next;
      if (Object.is(now, was)) return;
      states.set(k, now);
      tell();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` is the caller's first value, read only until set
    [k],
  );
  return [value, set];
}

/** The visit is over: what every row came to goes with it. */
export function clearRowStates(): void {
  if (!states.size) return;
  states.clear();
  tell();
}
