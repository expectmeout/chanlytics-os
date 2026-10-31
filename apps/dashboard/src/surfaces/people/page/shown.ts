/**
 * Who the view holds (moved from legacy/pages/people.jsx plPeopleShown, decision 0015): the loaded rows and what the
 * server found past them, in the view's state and list. The view is the address's (a state tab, a smart list, a list
 * kept by hand), and a change of it is a change of view, which lets the selection go; the table narrows these rows by
 * the box's words and puts them in the member's order (decision 0083, kit/table/use-data-table.ts), and the narrowing
 * keeps the selection.
 */
import type { PersonRowVM } from "@chanlytics/contracts";
import type { SavedList, SmartList } from "../types";
import { plWithFound } from "../words";

export function plViewRows({
  rows,
  found,
  lists,
  saved,
  tab,
  listId,
  savedId,
}: {
  rows: PersonRowVM[];
  found: PersonRowVM[] | null;
  lists: readonly SmartList[];
  saved: readonly SavedList[];
  tab: string;
  listId: string | null;
  savedId: string | null;
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
  return list;
}
