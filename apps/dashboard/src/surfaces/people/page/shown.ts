/**
 * Who the view shows, in its order (moved whole from legacy/pages/people.jsx plPeopleShown, decision 0015): the loaded
 * rows and what the server found, the state, the list and the words.
 */
import type { PersonRowVM } from "@chanlytics/contracts";
import { plCompare, plLastSort } from "../cells/sorts";
import type { SavedList, SmartList, TableColumn } from "../types";
import { plMatcher, plWithFound } from "../words";

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
  columns,
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
  /** The columns, whose `sortValue` says what each heading sorts by; an unknown heading sorts by the last contact. */
  columns: readonly Pick<TableColumn<PersonRowVM>, "key" | "sortValue" | "sortLast">[];
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
  const column = columns.find((c) => c.key === sortBy);
  const valueOf = column?.sortValue ?? plLastSort;
  const last = column?.sortLast;
  return [...list].sort((a, b) => {
    // Rows the heading puts last stay last whichever way it is pressed (Person's unnamed: "+1 (833)…" led A to Z).
    if (last) {
      const la = last(a);
      if (la !== last(b)) return la ? 1 : -1;
    }
    let av = valueOf(a, sortDir);
    let bv = valueOf(b, sortDir);
    // Offers ties fall to the last contact, as the default does.
    if (sortBy === "offers" && av === bv) {
      av = plLastSort(a);
      bv = plLastSort(b);
    }
    const order = plCompare(av, bv);
    if (order !== 0) return sortDir === "asc" ? order : -order;
    // Any other tie, the most recent contact first, whichever way the heading is pressed: two hundred people in one state
    // stood in the order the server sent them.
    return plCompare(plLastSort(b), plLastSort(a));
  });
}
