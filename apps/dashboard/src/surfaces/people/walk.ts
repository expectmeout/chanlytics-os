/**
 * Stepping from person to person (decision 0052, canvas A: "‹ People · ‹ 4 of 24 ›"): People keeps the order of the view it
 * draws (its list, search and sort, as the table drew them) in the tab, and a person's page reads it: where they stand in it,
 * and who is before and after. A person the order does not hold has no steps. In the tab's memory, so a refresh keeps it
 * and another workspace never sees it.
 */
import { tabMemory } from "../kit/record/shell-verbs";

const WALK = "people-walk";
/** At most this many of a view's people are kept: a step beyond them is People's own to take. */
const WALK_MAX = 1000;

/** Where a person stands in the view they were opened from, and who is either side; null outside it. */
export interface PersonWalk {
  at: number;
  of: number;
  prev: string | null;
  next: string | null;
}

/** People's view drew these people, in this order: the walk a person's page steps through. */
export function keepWalk(view: string, ids: readonly string[]): void {
  tabMemory()?.keepPlace(WALK, "order", { view, ids: ids.slice(0, WALK_MAX) });
}

/** Where this person stands in the view People last drew, or null where it does not hold them. */
export function walkOf(id: string): PersonWalk | null {
  const kept = tabMemory()?.place(WALK, "order");
  const ids = kept && Array.isArray(kept.ids) ? kept.ids.filter((x): x is string => typeof x === "string") : [];
  const i = ids.indexOf(id);
  if (i < 0 || ids.length < 2) return null;
  return { at: i + 1, of: ids.length, prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null };
}
