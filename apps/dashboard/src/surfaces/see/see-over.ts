/**
 * A thing open over the page (the Campaigns wiring review's rule C, lane 3, 19 Oct 2026): `?see=<kind>:<id>` on the page's
 * own address (contracts see-over.ts), as the lead sheet's `?lead=<id>` is (over-query.ts holds what the two do alike).
 * Opening it is one entry in the history, so Back closes it and the page under it is as it was left; one open is moved to
 * another in place. A move to another page leaves the query behind, so the sheet closes with the page.
 *
 * The frame's own move (bridge/workspace.ts goToRoute) asks `inPlace` before it moves: a press anywhere on a mention
 * of a run or a message -- a door (frame-doors.ts routeDoor), the bell's row, a page's own press -- opens the thing over the page
 * it was pressed on, rather than taking the person to the thing's home. A run's home is beside Sequences' list, so on
 * Campaigns' own pages a press on a run goes there; a message has no page of its own (Ruben, 11 Oct 2026), and with
 * Messages folded into Campaigns (17 Nov 2026) none to be at home on either: a press on one opens it over whatever page it
 * was pressed on, Campaigns' list too. A move that asks for the home itself (a run's Open in Campaigns) says so (`home`).
 */
import { SEE_PARAM, seeRefOf, seeRefOfRoute, seeValueOf, type SeeRef } from "./over";
import { overQuery } from "./over-query";

const SEE = overQuery(SEE_PARAM);

/** The thing the address opens over its page, or none. */
export function seeOverNow(): SeeRef | null {
  return seeRefOf(SEE.now());
}

/**
 * Open a thing over the page: one entry in the history, so Back closes it; one already open is moved to it in place, or,
 * with `stack`, opened over it as an entry of its own, so Back comes back to it (a run opened from To send's sheet).
 */
export function openSeeOver(ref: SeeRef, stack = false): void {
  SEE.open(seeValueOf(ref), !stack);
}

/** Close it: Back where opening it made the entry, else the address without it. */
export function closeSeeOver(): void {
  SEE.close();
}

/** Hear the sheet opened, moved or closed: by these verbs, a Back, or a page's own move. */
export function hearSeeOver(fn: () => void): () => void {
  return SEE.hear(fn);
}

/** The head of the route on screen where a run is at home: Campaigns' pages, where a press goes to the run's home itself. */
const RUN_HOMES = new Set(["campaigns", "broadcasts", "playbooks"]);

/**
 * Open a route's thing over the page, where it is one (a run's home, a message's) and the page on screen is not where the
 * thing is at home: true where it opened, false for a route the move should go to. `route` as the shell names it
 * (canonicalRoute).
 */
export function inPlace(route: string): boolean {
  if (typeof window === "undefined") return false;
  const ref = seeRefOfRoute(route);
  if (!ref) return false;
  const path = window.location.pathname;
  const head = /^\/w\/[^/?#]+\/([^/?#]*)/.exec(path)?.[1] ?? "";
  // To send and a message have no page of their own: each opens over whatever page it was pressed on.
  if (ref.kind === "run" && RUN_HOMES.has(head)) return false;
  openSeeOver(ref);
  return true;
}
