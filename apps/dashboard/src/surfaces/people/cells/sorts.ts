/**
 * What a row sorts by under each of People's headings, each the `sort.value` its column declares (columns.tsx) and the
 * one place the order is written: the table sorts the loaded rows by it (kit/table/use-data-table.ts), numbers as numbers
 * and words as words in the reader's order, so "Élodie" stands beside "Elodie" and house 2 comes before house 10. A row
 * with nothing to sort by under a heading (no visit, no next step, no deal, no first contact, no name yet) says so with
 * `undefined`, which sorts last whichever way the heading is pressed; ties fall to the page's tiebreak (`plSortThen`).
 */
import { isIdentifierName, type PersonRowVM } from "@chanlytics/contracts";
import type { SortThen } from "../../kit/table/state";

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

type SortValue = number | string | undefined;

/** By name; someone named by an identifier (a number, an address) has no name yet, and sorts after everyone who has one. */
export const plNameSort = (p: PersonRowVM): SortValue => (isIdentifierName(p.name) ? undefined : p.name);
/** By the words of their name, whatever they are: the order among those with no name yet (`f_name`, plSortThen). */
export const plNameWordsSort = (p: PersonRowVM): SortValue => p.name;
export const plStateSort = (p: PersonRowVM): SortValue => STATE_ORDER[p.state] ?? 0;
/** By the last contact; nobody heard from sorts first from the oldest, last from the newest. */
export const plLastSort = (p: PersonRowVM): SortValue => p.lastContact.ts ?? -Infinity;
export const plOffersSort = (p: PersonRowVM): SortValue => OFFER_RANK[p.consent.marketing] ?? 1;
export const plCallsSort = (p: PersonRowVM): SortValue => p.calls;

/** Ahead first (soonest), then the most recent visit, then never. */
export const plVisitsSort = (p: PersonRowVM): SortValue =>
  p.nextVisitMs ?? (p.lastVisitMs !== null ? PAST_VISITS_FROM + (PAST_VISITS_FROM - p.lastVisitMs) : undefined);

/** When they first wrote or phoned. */
export const plSinceSort = (p: PersonRowVM): SortValue => p.firstContact.ts ?? undefined;

/** By where their deals stand, the furthest on first: a client, a proposal out, a consultation, then the closed ones. */
const DEAL_RANK: Record<string, number> = { won: 4, proposed: 3, consultation: 2, ended: 1, lost: 0 };
/** The furthest any of their open deals stands (else the deal they had). */
export const plDealSort = (p: PersonRowVM): SortValue => {
  const stages = p.openDeals.length ? p.openDeals.map((d) => d.stage) : p.deal ? [p.deal.stage] : [];
  const ranks = stages.map((s) => DEAL_RANK[s] ?? 0);
  return ranks.length ? Math.max(...ranks) : undefined;
};

/** The soonest step first: its day, as the number it spells. */
export const plNextSort = (p: PersonRowVM): SortValue =>
  p.nextStep ? Number(p.nextStep.day.day.replace(/\D/g, "")) : undefined;

/** The most recent contact first. */
const LAST_DESC = { id: "last", desc: true } as const;

/**
 * People's ties: the most recent contact first, whichever way the heading is pressed (two hundred people in one state
 * stood in the order the server sent them). Offers' ties fall to the last contact the heading's own way, as the sort by
 * it does. Those with no name yet stand among themselves by the words they are named by, the heading's way.
 */
export const plSortThen: SortThen = (key, desc) =>
  key === "name"
    ? [{ id: "f_name", desc }, LAST_DESC]
    : key === "offers"
      ? [{ id: "last", desc }]
      : key === "last"
        ? []
        : [LAST_DESC];
