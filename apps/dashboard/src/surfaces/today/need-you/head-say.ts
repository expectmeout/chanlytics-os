/**
 * What Need you tells the head (Today in three zones, 2 Nov 2026): Ask's one line over the rows, which the list says as it
 * draws them (what Ask prepared, the first window to shut, a reply that goes on its own: contracts needYouSay). How many
 * need you is not the list's to tell: the head says the one count (needs-you.ts), which leaves a row the moment the list
 * acts on it. A plain store, as queue-coral.ts is: the list tells it as it draws, the head hears it, and it goes with the
 * list.
 */
import { useSyncExternalStore } from "react";

let needYouLine: string | null = null;
const headHearers = new Set<() => void>();

/** The list's line, told as it draws; nothing where the list is gone. */
export function tellHeadSay(line: string | null): void {
  if (line === needYouLine) return;
  needYouLine = line;
  headHearers.forEach((hear) => hear());
}

const hearHead = (on: () => void) => {
  headHearers.add(on);
  return () => {
    headHearers.delete(on);
  };
};
const headSaidNow = (): string | null => needYouLine;
const nothingSaid = (): string | null => null;

/** The list's line as the head says it, drawn again as it changes. */
export const useHeadSay = (): string | null => useSyncExternalStore(hearHead, headSaidNow, nothingSaid);
