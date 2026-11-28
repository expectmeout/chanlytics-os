/**
 * Ads as a list of its own (Ruben, 25 Nov 2026: a third tab beside Made and the Library, and fifty ads read as People's and
 * the Inbox's lists do): the filter beside it (All, then each group that holds an ad, with how many, Needs you amber), the
 * find line over a long list, and the groups the page draws, Ended folded while anything else stands over it. Under Ended,
 * folded again, the ads that are over with nothing to show over the page's days (listed.ts `quiet`): the list as it was,
 * with every ad still there to be found (the review of 28 Nov 2026, R2.7).
 *
 * What the list is looked through by is kept for the visit, since the bar draws the filter and the page the groups
 * (ads/content-bar.tsx, live-page.tsx), and it is one workspace's (R2.10): kept with the workspace the address named as it
 * was chosen, and read only while the address still names it. Another workspace is opened by loading its page today, which
 * starts it again; were one ever not to, its list starts at All with nothing found, never as another's was left.
 */
import { useSyncExternalStore } from "react";
import { adsWorkspaceNow } from "../needs-you";
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
/** How one workspace's list is looked through, with the workspace it is. */
let looked: { workspace: string | null; at: AdsLooked } = { workspace: null, at: AT_FIRST };
const lookHearers = new Set<() => void>();

function hearLooked(tell: () => void): () => void {
  lookHearers.add(tell);
  return () => void lookHearers.delete(tell);
}

/** How the list of the workspace on screen is looked through; as at first for any other than the one it was chosen in. */
const lookedHere = (): AdsLooked => (looked.workspace === adsWorkspaceNow() ? looked.at : AT_FIRST);

function look(next: Partial<AdsLooked>): void {
  looked = { workspace: adsWorkspaceNow(), at: { ...lookedHere(), ...next } };
  for (const tell of [...lookHearers]) tell();
}

/** How the list is looked through now, and its two changes: a filter chosen, and words found. */
export function useAdsLooked(): AdsLooked & {
  choose: (filter: AdFilter) => void;
  find: (about: string | null) => void;
} {
  const now = useSyncExternalStore(hearLooked, lookedHere, () => AT_FIRST);
  return { ...now, choose: (filter) => look({ filter }), find: (about) => look({ about }) };
}

/** One choice of the filter: its group, its words, how many it holds, and Needs you's amber. */
interface AdFilterChoice {
  value: AdFilter;
  label: string;
  count: number;
  owed: boolean;
}

/** The rows the list shows without a press: every one but the quiet, which wait folded under Ended. */
const inView = (rows: readonly LiveRowVM[]): LiveRowVM[] => rows.filter((row) => !row.quiet);

/**
 * The filter's choices: All, then each group that holds an ad, in the list's order. Each says how many the list shows of it
 * without a press, so All is the Ads tab's own figure; the quiet ones are under Ended's fold, and counted there.
 */
export function adFilterChoicesOf(rows: readonly LiveRowVM[]): AdFilterChoice[] {
  const seen = inView(rows);
  return [
    { value: "all", label: LIVE.allAds, count: seen.length, owed: false },
    ...AD_GROUPS.flatMap((group) => {
      const count = seen.filter((row) => row.group === group).length;
      return count > 0 ? [{ value: group, label: LIVE.groups[group], count, owed: group === "needs" }] : [];
    }),
  ];
}

/** The filter as it stands for these rows: one whose group shows nothing any more is All. */
export const adFilterOf = (rows: readonly LiveRowVM[], filter: AdFilter): AdFilter =>
  filter !== "all" && inView(rows).some((row) => row.group === filter) ? filter : "all";

/** A group as the page draws it: its rows, whether it starts folded under its heading, and its quiet ones. */
interface AdGroupVM {
  key: AdGroup;
  label: string;
  rows: LiveRowVM[];
  folds: boolean;
  /**
   * Ended alone: the ads that are over with nothing to show over the page's days, folded under the rest of the group
   * until their own line is pressed. Empty for every other group, and where a find shows them among its matches.
   */
  quiet: LiveRowVM[];
}

/**
 * The groups the list draws, each that holds a row, in order: the filter's alone, and of those only the ads whose name holds
 * the words found (on a list long enough to have its find line). Ended starts folded while another group stands over it; a
 * find shows every match open, the quiet among them, so an ad that never ran is found by its name. Where every ended ad is
 * quiet, they are the Ended group themselves, folded: there is nothing to fold them under.
 */
export function adGroupsOf(rows: readonly LiveRowVM[], at: Pick<AdsLooked, "filter" | "about">): AdGroupVM[] {
  const words = rows.length >= AD_FIND_FROM ? (at.about?.trim().toLowerCase() ?? "") : "";
  const filter = adFilterOf(rows, at.filter);
  const found = words ? rows.filter((row) => row.name.toLowerCase().includes(words)) : rows;
  const groups = AD_GROUPS.filter((key) => filter === "all" || key === filter).flatMap((key) => {
    const held = found.filter((row) => row.group === key);
    const seen = words ? held : inView(held);
    const quiet = words ? [] : held.filter((row) => row.quiet);
    if (held.length === 0) return [];
    // Nothing but quiet ones: they are the group, and it folds whatever stands over it.
    return seen.length === 0
      ? [{ key, label: LIVE.groups[key], rows: quiet, quiet: [], alone: true }]
      : [{ key, label: LIVE.groups[key], rows: seen, quiet, alone: false }];
  });
  return groups.map(({ alone, ...group }) => ({
    ...group,
    folds: group.key === "ended" && !words && (alone || groups.length > 1),
  }));
}
