/**
 * Reports — the mix every lens draws as bars (10 Oct 2026): a count by key put in order, each given its words and its
 * share of the largest, with the line under them or the words for why there is none. Out of the Receptionist lens, which
 * drew the first, once the People lens drew its own; each lens still words its keys and its lines itself. Pure, and only
 * Reports' page reads it (PAGE_ONLY in tooling/scripts/gen/contracts-browser-entry.mjs).
 */
import type { ReportBarVM } from "./reports";

/** A row of a mix before its bar is drawn: the key it is counted under, its words and its count. */
export type MixEntry = [id: string, label: string, value: number];

type Counts = Readonly<Record<string, number>>;

/** One mix: its bars and the line under them, or the words for why there is none. */
export interface MixPartVM {
  rows: ReportBarVM[];
  line: string | null;
  empty: string | null;
}

/** A word out of a closed set a row names by its key: nothing for a key the set does not hold (never `constructor`'s). */
export const ownWord = (words: Readonly<Record<string, string>>, key: string): string | undefined =>
  Object.hasOwn(words, key) ? words[key] : undefined;

/** A count by key as rows, most first and the key's own order between equals (the database's object has none worth keeping). */
export function rankedEntries(counts: Counts, labelOf: (key: string) => string): MixEntry[] {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]): MixEntry => [key, labelOf(key), n])
    .sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1));
}

/** 0..1 of the largest bar in its group, as every bar of the reports. */
export function barsOf(entries: MixEntry[]): ReportBarVM[] {
  const max = Math.max(1, ...entries.map(([, , value]) => value));
  return entries.map(([id, label, value]) => ({ id, label, value, share: value / max }));
}

export const mixOf = (entries: MixEntry[], line: string): MixPartVM => ({ rows: barsOf(entries), line, empty: null });
export const noMix = (empty: string | null): MixPartVM => ({ rows: [], line: null, empty });
