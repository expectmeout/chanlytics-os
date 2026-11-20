/**
 * The numbers a screen says of a watched folder (the footage sources plan, P5). The edge holds each where it is used
 * (apps/edge/lib/files/sources/pace.ts, takes/budgets.ts, which its capacity page reads as written), and
 * tests/files/screens/the-screens-say-the-code-s-numbers.test.mjs holds the two equal, so no sentence quotes a number
 * the code has left. A module of its own: a page that says one of them carries nothing else.
 */
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
} as const;
