/**
 * A thing open over the page (the Campaigns wiring review's rule C, lane 3, 19 Oct 2026): `?see=<kind>:<id>` on the page's
 * own address (contracts see-over.ts), read in the browser only (the frame is one prerender for every address), as the lead
 * sheet's `?lead=<id>` is (surfaces/leads/sheet/lead-over.ts). Opening it is one entry in the history, so Back closes it and
 * the page under it is as it was left. A move to another page leaves the query behind, so the sheet closes with the page.
 *
 * The frame's own move (workspace.ts goToRoute) asks `inPlace` before it moves: a press anywhere on a mention of a run or a
 * message -- a door (data-bits routeDoor), the bell's row, a page's own press -- opens the thing over the page it was
 * pressed on, rather than taking the person to the thing's home. Campaigns' own pages are the homes, and there a press goes
 * to the home as it did (the run beside Sequences' list). A move that asks for the home itself (the sheet's Open in
 * Campaigns) says so (`home`).
 */
import { SEE_PARAM, seeRefOf, seeRefOfRoute, seeValueOf, type SeeRef } from "@chanlytics/contracts";

/** Who is told the sheet opened, moved or closed: the frame's mount. */
const listeners = new Set<() => void>();
const tell = () => {
  for (const fn of listeners) fn();
};

/** The thing the address opens over its page, or none. */
export function seeOverNow(): SeeRef | null {
  if (typeof window === "undefined" || !window.location) return null;
  return seeRefOf(new URLSearchParams(window.location.search).get(SEE_PARAM));
}

/** The page's own address with a thing over it, or with none. */
function addressWith(ref: SeeRef | null): string {
  const url = new URL(window.location.href);
  if (ref) url.searchParams.set(SEE_PARAM, seeValueOf(ref));
  else url.searchParams.delete(SEE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The entry opening a thing made: Back where it is, so Back closes it. */
interface SeeState {
  seeOver: string;
}
const isSeeState = (s: unknown): s is SeeState =>
  !!s && typeof s === "object" && typeof (s as { seeOver?: unknown }).seeOver === "string";

/** Open a thing over the page: one entry in the history, so Back closes it; one already open is moved to it in place. */
export function openSeeOver(ref: SeeRef): void {
  const now = seeOverNow();
  if (now && seeValueOf(now) === seeValueOf(ref)) return;
  if (now) window.history.replaceState({ seeOver: seeValueOf(ref) }, "", addressWith(ref));
  else window.history.pushState({ seeOver: seeValueOf(ref) }, "", addressWith(ref));
  tell();
}

/** Close it: Back where opening it made the entry, else the address without it. */
export function closeSeeOver(): void {
  if (!seeOverNow()) return;
  if (isSeeState(window.history.state)) window.history.back();
  else {
    window.history.replaceState(null, "", addressWith(null));
    tell();
  }
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

/** Hear the sheet opened, moved or closed by these verbs (a Back is the window's popstate, a page's move the frame's). */
export function hearSeeOver(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
