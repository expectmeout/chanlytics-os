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
import { clockLabel, coversSpan, frameOf, monthLabelOf, shiftKey, shiftMonth, spanForView, windowFor, type CalendarView } from "@chanlytics/contracts";
import { api } from "./api";
import { calendarOverride, getCalendarSpan, setCalendarSpan } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";

/** Load `days` days starting on `from` (a day key); a null `from` is the window around today. */
export async function goTo(from: string | null, days = 63): Promise<boolean> {
  const prev = getCalendarSpan();
  setCalendarSpan(from, days);
  api().forget();
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
  const have = (window as unknown as { __CALENDAR?: { vm?: { days?: Array<{ key: string }> } } }).__CALENDAR?.vm?.days ?? [];
  if (coversSpan(have, need.from, need.days)) return true;
  const w = windowFor(anchor);
  return goTo(w.from, w.days);
}

/** What a feed holds, or the refusal's words. A read: nothing refreshes. Never throws. */
export async function previewFeed(url: string) {
  return api()("POST calendar/preview", { body: { url } });
}

/** Read the loaded window again: the board keeps itself current while it is open, so the now line, the next opening and the windows follow the clock. */
export async function refresh(): Promise<void> {
  api().forget();
  await refreshSurfaces([calendarOverride]);
}

export const calendar = { goTo, ensure, previewFeed, refresh, spanFor: spanForView, windowFor, covers: coversSpan, frameOf, shiftKey, shiftMonth, monthLabel: monthLabelOf, clockLabel };

declare global {
  interface Window {
    __calendar?: typeof calendar;
  }
}

export function installCalendar(): void {
  window.__calendar = calendar;
}
