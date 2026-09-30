/**
 * Who the view shows, in its order (moved whole from legacy/pages/people.jsx plPeopleShown, decision 0015): the loaded
 * rows and what the server found, the state, the list and the words.
 */
import type { PersonRowVM } from "@chanlytics/contracts";
import type { SavedList, SmartList } from "../types";
import { plMatcher, plWithFound } from "../words";

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
const OFFER_RANK: Record<string, number> = { opted_in: 0, unknown: 1, opted_out: 2 };

/** What a row sorts by under a heading: the name, the state, the visit, the offers answer, else the last contact. */
function sortKeyOf(p: PersonRowVM, sortBy: string, sortDir: string): number | string {
  switch (sortBy) {
    case "name":
      return p.name.toLowerCase();
    case "state":
      return STATE_ORDER[p.state] ?? 0;
    // Ahead first (soonest), then the most recent visit, then never.
    case "visits": {
      const none = sortDir === "asc" ? Infinity : -Infinity;
      return p.nextVisitMs ?? (p.lastVisitMs !== null ? PAST_VISITS_FROM + (PAST_VISITS_FROM - p.lastVisitMs) : none);
    }
    case "offers":
      return OFFER_RANK[p.consent.marketing] ?? 1;
    default:
      return p.lastContact.ts ?? -Infinity;
  }
}

export function plPeopleShown({
  rows,
  found,
  lists,
  saved,
  tab,
  listId,
  savedId,
  q,
  sortBy,
  sortDir,
}: {
  rows: PersonRowVM[];
  found: PersonRowVM[] | null;
  lists: readonly SmartList[];
  saved: readonly SavedList[];
  tab: string;
  listId: string | null;
  savedId: string | null;
  q: string;
  sortBy: string;
  sortDir: string;
}): PersonRowVM[] {
  let list = found ? plWithFound(rows, found) : rows;
  if (tab !== "all") list = list.filter((p) => p.state === tab);
  if (listId) {
    const l = lists.find((x) => x.id === listId);
    const ids = new Set(l ? l.ids : []);
    list = list.filter((p) => ids.has(p.id));
  }
  if (savedId) {
    const s = saved.find((x) => x.id === savedId);
    const ids = new Set(s ? s.ids : []);
    list = list.filter((p) => ids.has(p.id));
  }
  const match = plMatcher(q);
  if (match) list = list.filter(match);
  return [...list].sort((a, b) => {
    let av = sortKeyOf(a, sortBy, sortDir);
    let bv = sortKeyOf(b, sortBy, sortDir);
    // Offers ties fall to the last contact, as the default does.
    if (sortBy === "offers" && av === bv) {
      av = a.lastContact.ts ?? -Infinity;
      bv = b.lastContact.ts ?? -Infinity;
    }
    // A number against a number, a string against a string: the one comparison JavaScript's < makes of either.
    if ((av as number) < (bv as number)) return sortDir === "asc" ? -1 : 1;
    if ((av as number) > (bv as number)) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
}
