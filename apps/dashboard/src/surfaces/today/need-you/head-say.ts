/**
 * What Need you tells the head (the redesign of 1 Nov 2026): Ask's one line over the rows, which the queue counts as it
 * draws them (what Ask prepared, the first window to shut, a reply that goes on its own: contracts needYouSay), headLine by
 * the head's one sentence after how many need you (pages/today-head.tsx). It stood over the rows on a desk alone, under a
 * head that headLine the count again. A plain store, as queue-coral.ts is: the queue tells it as it draws, the head hears it,
 * and it goes with the queue.
 */
import { useSyncExternalStore } from "react";

let headLine: string | null = null;
const headHearers = new Set<() => void>();

/** The queue's line, told as it draws; null where Ask prepared nothing and nothing closes. */
export function tellHeadSay(line: string | null): void {
  if (line === headLine) return;
  headLine = line;
  headHearers.forEach((hear) => hear());
}

const hearHead = (on: () => void) => {
  headHearers.add(on);
  return () => {
    headHearers.delete(on);
  };
};
const headLineNow = (): string | null => headLine;
const noHeadLine = (): string | null => null;

/** The queue's line as the head says it, drawn again as it changes. */
export const useHeadSay = (): string | null => useSyncExternalStore(hearHead, headLineNow, noHeadLine);
