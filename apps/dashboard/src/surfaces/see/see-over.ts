/**
 * A thing open over the page (the Campaigns wiring review's rule C, lane 3, 19 Oct 2026): `?see=<kind>:<id>` on the page's
 * own address (contracts see-over.ts), as the lead sheet's `?lead=<id>` is (over-query.ts holds what the two do alike).
 * Opening it is one entry in the history, so Back closes it and the page under it is as it was left; one open is moved to
 * another in place. A move to another page leaves the query behind, so the sheet closes with the page.
 *
 * The frame's own move (legacy-bridge/workspace.ts goToRoute) asks `inPlace` before it moves: a press anywhere on a mention
 * of a run or a message -- a door (data-bits routeDoor), the bell's row, a page's own press -- opens the thing over the page
 * it was pressed on, rather than taking the person to the thing's home. Campaigns' own pages are the homes, and there a
 * press goes to the home as it did (the run beside Sequences' list). A move that asks for the home itself (the sheet's Open
 * in Campaigns) says so (`home`).
 */
import { SEE_PARAM, seeRefOf, seeRefOfRoute, seeValueOf, type SeeRef } from "@chanlytics/contracts";
import { overQuery } from "./over-query";

const SEE = overQuery(SEE_PARAM);

/** The thing the address opens over its page, or none. */
export function seeOverNow(): SeeRef | null {
  return seeRefOf(SEE.now());
}

/** Open a thing over the page: one entry in the history, so Back closes it; one already open is moved to it in place. */
export function openSeeOver(ref: SeeRef): void {
  SEE.open(seeValueOf(ref), true);
}

/** Close it: Back where opening it made the entry, else the address without it. */
export function closeSeeOver(): void {
  SEE.close();
}

/** Hear the sheet opened, moved or closed: by these verbs, a Back, or a page's own move. */
export function hearSeeOver(fn: () => void): () => void {
  return SEE.hear(fn);
}

/** The head of the route on screen: a Campaigns page is a home, where a press goes to the thing's home itself. */
const HOMES = new Set(["campaigns", "broadcasts", "templates", "playbooks"]);

/**
 * Open a route's thing over the page, where it is one (a run's home, a message's drawer) and the page on screen is no home of
 * Campaigns': true where it opened, false for a route the move should go to. `route` as the shell names it (canonicalRoute).
 */
export function inPlace(route: string): boolean {
  if (typeof window === "undefined") return false;
  const ref = seeRefOfRoute(route);
  if (!ref) return false;
  const head = /^\/w\/[^/?#]+\/([^/?#]*)/.exec(window.location.pathname)?.[1] ?? "";
  if (HOMES.has(head)) return false;
  openSeeOver(ref);
  return true;
}
