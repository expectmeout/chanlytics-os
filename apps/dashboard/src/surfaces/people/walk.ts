/**
 * Stepping from person to person (decision 0052, canvas A: "‹ People · ‹ 4 of 24 ›"): People keeps the order of the view it
 * draws (its list, search and sort, as the table drew them) in the tab, and a person's page reads it: where they stand in it,
 * and who is before and after. Only for a person opened from that list (it was on screen as they were opened) or stepped
 * to from it: one opened from the Inbox, Today or a link has no steps, though the list may hold them (it stood there
 * with the last list's "3 of 8", 13 Oct 2026). A person the order does not hold has no steps. In the tab's memory, so a
 * refresh keeps it and another workspace never sees it.
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

/** What the tab keeps: the order, whether the list is on screen, and the person whose page took the walk last. */
function keptWalk(): { view: unknown; ids: string[]; shown: boolean; armed: string | null } {
  const kept = tabMemory()?.place(WALK, "order");
  const ids = kept && Array.isArray(kept.ids) ? kept.ids.filter((x): x is string => typeof x === "string") : [];
  return {
    view: kept?.view,
    ids,
    shown: kept?.shown === true,
    armed: typeof kept?.armed === "string" ? kept.armed : null,
  };
}

function keepIt(
  was: ReturnType<typeof keptWalk>,
  change: { view?: string; ids?: string[]; shown?: boolean; armed?: string | null },
): void {
  tabMemory()?.keepPlace(WALK, "order", { ...was, ...change });
}

/** People's view drew these people, in this order: the walk a person's page steps through. The list is on screen. */
export function keepWalk(view: string, ids: readonly string[]): void {
  keepIt(keptWalk(), { view, ids: ids.slice(0, WALK_MAX), shown: true });
}

/** People's list has gone (its last draw's clean-up): a person opened after this was not opened from it. */
export function leaveWalk(): void {
  keepIt(keptWalk(), { shown: false });
}

/**
 * Where this person stands in the view People last drew, or null where it does not hold them or they were not opened from
 * it: read as their page is drawn, while the list it was opened from is still on screen (its clean-up comes after).
 */
export function walkOf(id: string): PersonWalk | null {
  const kept = keptWalk();
  return kept.shown || kept.armed === id ? walkIn(kept.ids, id) : null;
}

/** This person's page took the walk: a refresh of it, or a step from it, keeps it. */
export function armWalk(id: string): void {
  const kept = keptWalk();
  if (kept.armed !== id) keepIt(kept, { armed: id });
}

/** Where a person stands in an order of people (People's shown rows, or the order a view kept), or null outside it. */
export function walkIn(ids: readonly string[], id: string): PersonWalk | null {
  const i = ids.indexOf(id);
  if (i < 0 || ids.length < 2) return null;
  return { at: i + 1, of: ids.length, prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null };
}

/** The side the last step went, kept for the page it lands on: a step is a new mount, which turns toward it. */
let stepped: { to: string; side: "next" | "prev" } | null = null;

/** A step is on its way to `to`, toward the next person or the one before. */
export function noteStep(to: string, side: "next" | "prev"): void {
  stepped = { to, side };
  armWalk(to);
}

/** The side a step to this person went, taken once: undefined where they were opened any other way. */
export function takeStep(id: string): "next" | "prev" | undefined {
  const was = stepped;
  stepped = null;
  return was && was.to === id ? was.side : undefined;
}
