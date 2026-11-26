/**
 * Ads as a list of its own (Ruben, 25 Nov 2026: a third tab beside Made and the Library, and fifty ads read as People's and
 * the Inbox's lists do): the filter beside it (All, then each group that holds an ad, with how many, Needs you amber), the
 * find line over a long list, and the groups the page draws, Ended folded while anything else stands over it. What the list
 * is looked through by is kept for the visit, since the bar draws the filter and the page the groups (ads/content-bar.tsx,
 * live-page.tsx); another workspace is opened by loading its page, which starts it again.
 */
import { useSyncExternalStore } from "react";
import { AD_GROUPS, type AdGroup, type LiveRowVM } from "./model";
import { LIVE } from "./words";

/** What the list shows: every group, or one. */
type AdFilter = "all" | AdGroup;

/** From how many ads the list has a find line over it, as a long list of People's or the Inbox's does. */
export const AD_FIND_FROM = 20;

/** How the list is looked through: the filter, and the words found. */
interface AdsLooked {
  filter: AdFilter;
  about: string | null;
}

const AT_FIRST: AdsLooked = { filter: "all", about: null };
let looked: AdsLooked = AT_FIRST;
const lookHearers = new Set<() => void>();

function hearLooked(tell: () => void): () => void {
  lookHearers.add(tell);
  return () => void lookHearers.delete(tell);
}

function look(next: Partial<AdsLooked>): void {
  looked = { ...looked, ...next };
  for (const tell of [...lookHearers]) tell();
}

/** How the list is looked through now, and its two changes: a filter chosen, and words found. */
export function useAdsLooked(): AdsLooked & {
  choose: (filter: AdFilter) => void;
  find: (about: string | null) => void;
} {
  const now = useSyncExternalStore(
    hearLooked,
    () => looked,
    () => AT_FIRST,
  );
  return { ...now, choose: (filter) => look({ filter }), find: (about) => look({ about }) };
}

/** One choice of the filter: its group, its words, how many it holds, and Needs you's amber. */
interface AdFilterChoice {
  value: AdFilter;
  label: string;
  count: number;
  owed: boolean;
}

/** The filter's choices: All, then each group that holds an ad, in the list's order. */
export function adFilterChoicesOf(rows: readonly LiveRowVM[]): AdFilterChoice[] {
  return [
    { value: "all", label: LIVE.allAds, count: rows.length, owed: false },
    ...AD_GROUPS.flatMap((group) => {
      const count = rows.filter((row) => row.group === group).length;
      return count > 0 ? [{ value: group, label: LIVE.groups[group], count, owed: group === "needs" }] : [];
    }),
  ];
}

/** The filter as it stands for these rows: one whose group holds nothing any more is All. */
export const adFilterOf = (rows: readonly LiveRowVM[], filter: AdFilter): AdFilter =>
  filter !== "all" && rows.some((row) => row.group === filter) ? filter : "all";

/** A group as the page draws it: its rows, and whether it starts folded under its heading. */
interface AdGroupVM {
  key: AdGroup;
  label: string;
  rows: LiveRowVM[];
  folds: boolean;
}

/**
 * The groups the list draws, each that holds a row, in order: the filter's alone, and of those only the ads whose name holds
 * the words found (on a list long enough to have its find line). Ended starts folded while another group stands over it; a
 * find shows every match open.
 */
export function adGroupsOf(rows: readonly LiveRowVM[], at: Pick<AdsLooked, "filter" | "about">): AdGroupVM[] {
  const words = rows.length >= AD_FIND_FROM ? (at.about?.trim().toLowerCase() ?? "") : "";
  const filter = adFilterOf(rows, at.filter);
  const found = words ? rows.filter((row) => row.name.toLowerCase().includes(words)) : rows;
  const groups = AD_GROUPS.filter((key) => filter === "all" || key === filter).flatMap((key) => {
    const held = found.filter((row) => row.group === key);
    return held.length > 0 ? [{ key, label: LIVE.groups[key], rows: held }] : [];
  });
  return groups.map((group) => ({ ...group, folds: group.key === "ended" && !words && groups.length > 1 }));
}
