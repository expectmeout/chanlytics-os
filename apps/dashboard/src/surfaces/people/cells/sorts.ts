/**
 * What a row sorts by under each of People's headings, each the `sortValue` its column declares (columns.tsx) and the one
 * place the order is written: the page sorts the loaded rows by it (page/shown.ts) and a heading's first press, the
 * caption under the list's name and the phone's menu all read the column. A number sorts as a number and words sort as
 * words, in the reader's order (plCompare), so "Élodie" stands beside "Elodie" and house 2 comes before house 10.
 */
import type { PersonRowVM } from "@chanlytics/contracts";

/** Where the visits behind us sort from: past every offset a visit ahead can have, most recent first (as the JSX wrote it, 1e15). */
const PAST_VISITS_FROM = 1e15;

/** By state: who needs a person first, then who is waiting on one, then the rest in the rail's order. Never heard from sits with the quiet (decision 0009). */
const STATE_ORDER: Record<string, number> = {
  needs_you: 6,
  waiting_on_you: 5,
  opted_out: 4,
  new: 3,
  quiet: 2,
  unheard: 1,
  active: 0,
};
/** Who said yes first, then who has not been asked, then who said no. */
const OFFER_RANK: Record<string, number> = { opted_in: 0, unknown: 1, opted_out: 2 };

type SortValue = number | string;

export const plNameSort = (p: PersonRowVM): SortValue => p.name;
export const plStateSort = (p: PersonRowVM): SortValue => STATE_ORDER[p.state] ?? 0;
export const plLastSort = (p: PersonRowVM): SortValue => p.lastContact.ts ?? -Infinity;
export const plOffersSort = (p: PersonRowVM): SortValue => OFFER_RANK[p.consent.marketing] ?? 1;
export const plCallsSort = (p: PersonRowVM): SortValue => p.calls;

/** Ahead first (soonest), then the most recent visit, then never: never is last whichever way the heading is pressed. */
export const plVisitsSort = (p: PersonRowVM, dir: string): SortValue => {
  const none = dir === "asc" ? Infinity : -Infinity;
  return p.nextVisitMs ?? (p.lastVisitMs !== null ? PAST_VISITS_FROM + (PAST_VISITS_FROM - p.lastVisitMs) : none);
};

/** The soonest step first, and a row with none last whichever way the heading is pressed: its day, as the number it spells. */
export const plNextSort = (p: PersonRowVM, dir: string): SortValue =>
  p.nextStep ? Number(p.nextStep.day.day.replace(/\D/g, "")) : dir === "asc" ? Infinity : -Infinity;

const IN_READERS_ORDER = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Two sort values in order: numbers as numbers, words as words in the reader's order. */
export const plCompare = (a: SortValue, b: SortValue): number =>
  typeof a === "string" && typeof b === "string" ? IN_READERS_ORDER.compare(a, b) : a < b ? -1 : a > b ? 1 : 0;
