/**
 * The few more things the Calendar asks of the shell (decision 0015), beside legacy-verbs.ts: each is one function that
 * calls the window's own where it is, typed, and does what the JSX did where it is not. A surface never reads the
 * window itself; it imports these. Each is a line to delete on the day its owner moves: People's rows with People, the
 * touch list and the pill with the frame's components.
 */
import type { calendarPeekDeal } from "@chanlytics/contracts";
import { openDealSheet, type DealSheetAsk, type StayingPage, type SwipeHandlers } from "../legacy-verbs";
import { statePillPart } from "../legacy-parts";

/** People, as far as an appointment's peek reads it (contracts calendarPeekDeal): whether deals are on, and each row's deal. */
type PeopleRead = Parameters<typeof calendarPeekDeal>[1];

/** What the shell publishes that the Calendar reads, under the names it publishes them. */
interface CalendarShell {
  __PEOPLE?: PeopleRead;
}

const shell = (): Window & CalendarShell => window;

/** People's read, as the page holds it (`window.__PEOPLE`): nothing before People lands. */
export function peopleRead(): PeopleRead {
  return shell().__PEOPLE;
}

/** Hear People move (its surface's own event): a rows read, a deal recorded. The answer lets go. */
export function onPeopleMoved(heard: () => void): () => void {
  window.addEventListener("surface:clients", heard);
  return () => window.removeEventListener("surface:clients", heard);
}

/** Whether the one deal sheet is installed to be asked for (components/deal-sheet.jsx publishes it as the shell draws). */
export function dealSheetInstalled(): boolean {
  return typeof window.openDealSheet === "function";
}

/**
 * Ask for the one deal sheet as the Calendar does: `service` is the consultation's, null when its title named none. The shell's
 * own type (legacy-verbs DealSheetAsk) says `string | undefined`, and the sheet takes the null as none; `mode` is null for an act
 * that opens the thread (a send), which the peek's never is.
 */
export function askDealSheet(ask: { personId: string; mode: string | null; service: string | null }): void {
  openDealSheet(ask as DealSheetAsk);
}

/** Run a change so it is drawn at once (React's flushSync, which the shell publishes with its React), else just run it. */
export function flushChange(change: () => void): void {
  const flush = window.ReactDOM?.flushSync;
  if (flush) flush(change);
  else change();
}

/**
 * A thumb's gestures for the Calendar's days, a page that stays (legacy-verbs StayingPage: the same element shows the
 * next days, so data-bits turns it in place after `go`): none where the shell has none.
 */
export function touchSwipeStaying(options: {
  pages: (el: Element, from: EventTarget | null) => StayingPage | null;
  when: () => boolean;
}): SwipeHandlers {
  return window.touchSwipe ? window.touchSwipe(options) : {};
}

/** The shell's routes the Calendar sends a person to (data/constants.jsx `R`): the thread a booking link is texted in, and Settings. */
export const routeTo = {
  thread: (threadId: string): string => `inbox/${threadId}`,
  admin: (pane: string): string => `admin/${pane}`,
  person: (personId: string): string => `clients/${personId}`,
};

/** The shell's pill for a state (the kit's StatePill, published for the pages that draw it by name): the shell's part. */
export const statePill = statePillPart;
