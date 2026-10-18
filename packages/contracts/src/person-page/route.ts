/**
 * A person's page as addresses (decision 0052, 13): `clients/<id>` is Overview, and each other tab is the person's
 * address with its word, `clients/<id>/history`, `/visits`, `/deals`, `/campaigns` (`/about` on a phone). A tab's press
 * replaces the address, so the page is not mounted again and Back leaves the person. One parse (personRouteOf), one
 * writer (personTabRoute), and the tabs a person has (personTabsOf): a tab exists only when it holds something.
 */

import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";

const PERSON_TABS = ["overview", "history", "visits", "deals", "campaigns", "about"] as const;
export type PersonTab = (typeof PERSON_TABS)[number];

/** Each tab's word; the appointments' is the workspace's own, said by personTabWord. */
export const PERSON_TAB_WORDS: Record<PersonTab, string> = {
  overview: "Overview",
  history: "History",
  visits: "Appointments",
  deals: "Deals",
  campaigns: "Campaigns",
  about: "About",
};

/**
 * A tab's word in the workspace's words: the appointments' is its word for them ("Meetings", "Sessions": decision
 * 0041), as History's filter says it (timelineFilterLabel); the others their own.
 */
export function personTabWord(id: PersonTab, word: AppointmentWord): string {
  return id === "visits" ? appointmentWords(word).Many : PERSON_TAB_WORDS[id];
}

/** What the strip of tabs and the figures are, to a screen reader. */
export const PERSON_TABS_LABEL = "Their page";
export const PERSON_FIGURES_LABEL = "At a glance";

/**
 * The person and the tab an address under `clients` names: "<id>" is Overview, "<id>/<tab>" that tab; a tab word this
 * page does not know is Overview, so an old or mistyped address still opens the person.
 */
export function personRouteOf(param: string): { id: string; tab: PersonTab } {
  const slash = param.indexOf("/");
  if (slash < 0) return { id: param, tab: "overview" };
  const id = param.slice(0, slash);
  const word = param.slice(slash + 1).split(/[/?#]/)[0] ?? "";
  const tab = (PERSON_TABS as readonly string[]).includes(word) ? (word as PersonTab) : "overview";
  return { id, tab };
}

/** The address of a person's tab: their own address for Overview, else theirs with the tab's word. */
export function personTabRoute(id: string, tab: PersonTab): string {
  return tab === "overview" ? `clients/${id}` : `clients/${id}/${tab}`;
}

/** One tab as the strip draws it: its word, its count on a desk (null where it has none to say), and its address. */
export interface PersonTabVM {
  id: PersonTab;
  label: string;
  count: number | null;
  to: string;
}

/** What decides a person's tabs: how many of each there are, and whether the record is thin. */
export interface PersonTabFacts {
  id: string;
  history: number;
  visits: number;
  /** Their visits the record holds from before the season, said kept or missed (R7): a Visits tab with no row listed. */
  marked?: number;
  deals: number;
  campaigns: number;
  /** No thread, no deal and fewer than six rows of history: one scroll, no tabs (the thin-record rule). */
  thin: boolean;
  /** What the workspace calls an appointment: the appointments' tab says it (personTabWord). */
  word: AppointmentWord;
}

/**
 * The tabs a person has. On a desk: Overview, then History, Visits, Deals and Campaigns where each holds something, each
 * with its count. On a phone: Overview, History and Visits where they hold something, and About (the rail's groups);
 * Deals and Campaigns are inside Overview there, and no tab says a count. A thin record has none.
 */
export function personTabsOf(f: PersonTabFacts, phone: boolean): PersonTabVM[] {
  if (f.thin) return [];
  const tab = (id: PersonTab, count: number | null): PersonTabVM => ({
    id,
    label: personTabWord(id, f.word),
    count: phone ? null : count,
    to: personTabRoute(f.id, id),
  });
  const tabs: PersonTabVM[] = [tab("overview", null)];
  if (f.history > 0) tabs.push(tab("history", f.history));
  if (f.visits > 0 || (f.marked ?? 0) > 0) tabs.push(tab("visits", f.visits > 0 ? f.visits : null));
  if (!phone && f.deals > 0) tabs.push(tab("deals", f.deals));
  if (!phone && f.campaigns > 0) tabs.push(tab("campaigns", null));
  if (phone) tabs.push(tab("about", null));
  return tabs;
}
