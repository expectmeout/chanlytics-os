import { DAY_MS } from "@chanlytics/contracts";

/**
 * Whoever a press of Delete… has handed the ledger has left what lists people, from the press (decision 0036): the block
 * is written at once and the erasing takes seconds or minutes behind it, so a list that waited for each erasure would
 * drain for as long as the ledger took. A day on it is an erasure that stopped, and they show again, to be pressed again.
 * people_page says this in SQL (00547); this is the rule for what the server reads beside it. A person or a thread read by
 * its id is one record, not a list, and still reads.
 */
const GONE_FROM_LISTS_MS = DAY_MS;

/** The rule as a PostgREST filter, on `contacts` or on an embed of them. */
export const stillListed = (now: number): string =>
  `erasing_since.is.null,erasing_since.lt.${new Date(now - GONE_FROM_LISTS_MS).toISOString()}`;

/** The rule for a row already read, where the filter cannot reach it: an embed that may be empty, or two joins away. */
export const isGoing = (erasingSince: string | null | undefined, now: number): boolean =>
  !!erasingSince && Date.parse(erasingSince) >= now - GONE_FROM_LISTS_MS;
