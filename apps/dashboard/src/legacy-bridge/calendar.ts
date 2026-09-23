/**
 * Calendar, the verbs and the arithmetic: `window.__calendar`.
 *
 * The page keeps one loaded WINDOW of days (nine weeks around the day it
 * looks at) and derives every view from it — a week, a day, six weeks for
 * a month, two weeks for the agenda — so switching views is a slice, never
 * a fetch. Only a move outside the window reads again, through the runner,
 * so the cache and the pill agree with what is on screen. The span
 * arithmetic lives in contracts and is exposed here, so the page (a classic
 * script that cannot import) and the tests use one implementation.
 *
 * The preview is a read of a feed the workspace has not saved yet; it
 * changes nothing.
 */
import {
  calendarPeekDeal,
  clockLabel,
  coversSpan,
  durationLabel,
  frameOf,
  monthLabelOf,
  shiftKey,
  shiftMonth,
  spanForView,
  windowFor,
  type CalendarView,
} from "@chanlytics/contracts";
import { api } from "./api";
import {
  calendarOverride,
  getCalendarSpan,
  paintHeldCalendar,
  setCalendarFresh,
  setCalendarSpan,
} from "./surface-data";
import { refreshSurfaces } from "./surface-runner";

/** Load `days` days starting on `from` (a day key); a null `from` is the window around today. */
export async function goTo(from: string | null, days = 63): Promise<boolean> {
  const prev = getCalendarSpan();
  setCalendarSpan(from, days);
  api().forget();
  // A window this tab has read paints at once; the read behind it keeps it current (the loading standard's held
  // views). Only a window never read waits for its read.
  if (paintHeldCalendar()) {
    void refreshSurfaces([calendarOverride]);
    return true;
  }
  await refreshSurfaces([calendarOverride]);
  const got = (window as unknown as { __CALENDAR?: { vm?: { from?: string; days?: unknown[] } } }).__CALENDAR?.vm;
  if ((from && got?.from !== from) || (got?.days && got.days.length !== days)) {
    setCalendarSpan(prev.from, prev.days);
    return false;
  }
  return true;
}

/** Make sure the window covers what a view needs from its anchor; reads only when it does not. */
export async function ensure(view: CalendarView, anchor: string): Promise<boolean> {
  const need = spanForView(view, anchor);
  const have =
    (window as unknown as { __CALENDAR?: { vm?: { days?: Array<{ key: string }> } } }).__CALENDAR?.vm?.days ?? [];
  if (coversSpan(have, need.from, need.days)) return true;
  const w = windowFor(anchor);
  return goTo(w.from, w.days);
}

/**
 * Leaving the Calendar: the loaded window goes back to the weeks around today.
 * Today's day, its next open time and its facts read this same surface, so a
 * board left on another month took them with it until a reload (C1). Reads
 * only when the window had moved, and says whether it had.
 */
export async function home(): Promise<boolean> {
  if (getCalendarSpan().from === null) return false;
  await goTo(null);
  return true;
}

/** What a feed holds, or the refusal's words. A read: nothing refreshes. Never throws. */
export async function previewFeed(url: string) {
  return api()("POST calendar/preview", { body: { url } });
}

/**
 * Read the loaded window again: the board keeps itself current while it is open, so the now line, the next open time
 * and the windows follow the clock. `fresh` is the owner's Refresh (C2): the route reads the calendar itself rather
 * than its few minutes' cache. Says whether a read landed, so the board can say so when none did.
 */
export async function refresh(opts: { fresh?: boolean } = {}): Promise<boolean> {
  const stamp = () => (window as unknown as { __CALENDAR?: { fetchedAt?: number } }).__CALENDAR?.fetchedAt;
  const before = stamp();
  setCalendarFresh(!!opts.fresh);
  api().forget();
  try {
    await refreshSurfaces([calendarOverride]);
  } finally {
    // A read that never ran must not leave the next ordinary one asking for fresh.
    setCalendarFresh(false);
  }
  return stamp() !== before;
}

export const calendar = {
  goTo,
  ensure,
  home,
  previewFeed,
  refresh,
  spanFor: spanForView,
  windowFor,
  covers: coversSpan,
  frameOf,
  shiftKey,
  shiftMonth,
  monthLabel: monthLabelOf,
  clockLabel,
  // The agenda's rows say how long an appointment runs, as Today's do: one spelling, the view model's.
  durationLabel,
  // What an appointment's peek says of its person's deal, from the People row the page holds (0008): the rule and the
  // words are contracts', so the page only draws them.
  peekDeal: calendarPeekDeal,
};

declare global {
  interface Window {
    __calendar?: typeof calendar;
  }
}

export function installCalendar(): void {
  window.__calendar = calendar;
}
