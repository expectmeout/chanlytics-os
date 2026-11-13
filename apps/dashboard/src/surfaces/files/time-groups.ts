/**
 * A list that comes newest first, a page at a time, under two headings: This week and Earlier (Ruben, 12 Nov 2026: a list's
 * rows stand under headings, as Sequences', Messages' and the Pipeline's do). Content's Made and its Library both read it.
 * The week is the business's own, Monday to Sunday (contracts inLocalWeek), as Posted's lines already split by.
 *
 * A heading says how many it holds only where that is known whole: This week once the list has read past the week, or to
 * its end; Earlier once the list is read to its end. A count of what happens to be read so far would say a number the
 * database does not hold. Pure: the zone and now are handed in.
 */
import { CONTENT_WORDS, inLocalWeek } from "@chanlytics/contracts";

/** One run of the list under its heading; `count` is null while more of it may be on a page not read. */
export interface TimeGroup<T> {
  key: "week" | "earlier";
  label: string;
  count: number | null;
  items: T[];
}

/** The list under This week and Earlier, each that holds any, in that order. `more` is whether a next page is still unread. */
export function timeGroupsOf<T>(
  items: readonly T[],
  atOf: (item: T) => string,
  at: { zone: string; nowMs: number; more: boolean },
): TimeGroup<T>[] {
  const week: T[] = [];
  const earlier: T[] = [];
  for (const item of items) (inLocalWeek(Date.parse(atOf(item)), at.zone, at.nowMs) ? week : earlier).push(item);
  const says = CONTENT_WORDS.views;
  const groups: TimeGroup<T>[] = [
    { key: "week", label: says.thisWeek, count: earlier.length > 0 || !at.more ? week.length : null, items: week },
    { key: "earlier", label: says.earlier, count: at.more ? null : earlier.length, items: earlier },
  ];
  return groups.filter((group) => group.items.length > 0);
}
