/**
 * The numbers a screen says of a watched folder (the footage sources plan, P5). The edge holds each where it is used
 * (apps/edge/lib/files/sources/pace.ts, takes/budgets.ts, which its capacity page reads as written), and
 * tests/files/screens/the-screens-say-the-code-s-numbers.test.mjs holds the two equal, so no sentence quotes a number
 * the code has left. A module of its own: a page that says one of them carries nothing else. `graceDays` alone the
 * edge reads from here (takes/budgets.ts SOURCE_GRACE), since the capacity page reads none of the cleanup's numbers.
 */
/** A million of Google's units: its quota is written in them, as the edge writes it (takes/budgets.ts). */
const MILLION_UNITS = 1_000_000;

export const FOOTAGE_NUMBERS = {
  /** What a first watch brings in first: the newest of the last `firstDays` days, `firstItems` at most (D11). */
  firstItems: 50,
  firstDays: 30,
  /** The most files a folder is listed to. */
  itemsMax: 50_000,
  /** Files a workspace's folder brings in in a day, and how many are on their way at once. */
  takesADay: 100,
  takesAtOnce: 5,
  /** Clips a workspace brings back from its folder in a day. */
  returnsADay: 20,
  /** Days a file whose original left its folder stays in the Library, unused, before it leaves (the plan's D3). */
  graceDays: 7,
  /** Google's units and the bytes the whole platform's takes and returns may spend in a day: Health says how near. */
  unitsADay: 300 * MILLION_UNITS,
  platformBytesADay: 800_000_000_000,
} as const;
