/**
 * The Calendar's override: the span the page shows, held between reads, and the
 * bookings over it. Part of the SurfaceData seam (../surface-data.ts).
 */

import { read } from "../api";
import { knownZone, workspaceZone } from "../zone";
import { heldViews } from "../held-views";
import { routeOnScreen } from "../workspace";
import { toCalendarVM, windowFor, zoneDayKey, type CalendarVM } from "@chanlytics/contracts";
import type { SurfaceOverride } from "../surface-data";

/* ------------------------------- Calendar -------------------------------- */

/** The window loaded: a day key and a length in days; null is the window around today. Not persisted — a reload opens on today. */
let calendarFrom: string | null = null;
let calendarDays = 63;
/** The next read asks the calendar itself, not the route's few minutes' cache: the board's Refresh (C2). Taken by that read. */
let calendarFresh = false;
/** Whether the surface has made its first read, which alone takes its window from the address. */
let calendarBooted = false;

export function setCalendarFresh(on: boolean): void {
  calendarFresh = on;
}

export function getCalendarSpan(): { from: string | null; days: number } {
  return { from: calendarFrom, days: calendarDays };
}

export function setCalendarSpan(from: string | null, days = 63): void {
  calendarFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
  calendarDays = Math.min(63, Math.max(1, Math.round(days) || 63));
}

export interface CalendarSurface {
  vm: CalendarVM;
  fetchedAt: number;
}

/**
 * The windows this tab has read (the loading standard's held views): going back to one paints at once, and the read
 * behind it keeps it current. Measured on the salon's workspace: the board held one window, so back to this week and
 * back to December were 390-500ms of "Reading those days…" each. Keyed by the span a window covers, so the weeks
 * around today and the same weeks reached by their date are one.
 */
const calendarHeld = heldViews<CalendarSurface>(6);
const calendarSpanKey = (w: { from: string; days: number }) => `${w.from}|${w.days}`;
/** The span a window asked for covers: its own, or the weeks around the business's today (unknown before the zone is). */
function calendarSpanOf(from: string | null, days: number): { from: string; days: number } | null {
  if (from) return { from, days };
  const zone = knownZone();
  return zone ? windowFor(zoneDayKey(Date.now(), zone)) : null;
}
/** Paint a window this tab holds for the span now asked for; whether it did. The read behind it is the caller's. */
export function paintHeldCalendar(): boolean {
  const w = calendarSpanOf(calendarFrom, calendarDays);
  const have = w ? calendarHeld.get(calendarSpanKey(w)) : undefined;
  if (!have) return false;
  (window as unknown as { __CALENDAR?: CalendarSurface }).__CALENDAR = have;
  window.dispatchEvent(new CustomEvent("surface:calendar"));
  return true;
}

/**
 * Calendar: the owner's calendar as the receptionist reads it — what the
 * feed says is taken, the hours and closures, and the windows a caller
 * would be offered — one span of days by the business's clock. The feed's
 * address never reaches the browser; the route reads it.
 */
export const calendarOverride: SurfaceOverride = {
  key: "calendar",
  globals: ["__CALENDAR"],
  events: ["surface:calendar"],
  // A span's reads take their turn; a move to another span is read at once (activateOverride).
  view: () => `${calendarFrom ?? "today"}|${calendarDays}`,
  apply: async () => {
    // A cold boot on a day the address names (calendar/<day>) reads the weeks around that day: the page's own read.
    // It read today's weeks first, and the page read the day's after them. Only the first read looks at the address.
    if (!calendarBooted) {
      calendarBooted = true;
      const named = /^calendar\/(\d{4}-\d{2}-\d{2})$/.exec(
        typeof window !== "undefined" && window.location ? routeOnScreen() : "",
      );
      if (named && calendarFrom === null) {
        const w = windowFor(named[1]);
        setCalendarSpan(w.from, w.days);
      }
    }
    const from = calendarFrom;
    const days = calendarDays;
    // A Refresh asks once: the flag goes with the read that takes it.
    const fresh = calendarFresh;
    calendarFresh = false;
    // The window around the business's today, not the browser's (zone.ts).
    const w = from ? { from, days } : windowFor(zoneDayKey(Date.now(), await workspaceZone()));
    const data = await read("GET calendar", {
      query: { from: w.from, days: String(w.days), ...(fresh ? { fresh: "1" as const } : {}) },
    });
    // Two moves in a row: the earlier read may land after the later one. A
    // read for a span the page has since left is dropped, never painted.
    if (from !== calendarFrom || days !== calendarDays) return;
    const surface: CalendarSurface = { vm: toCalendarVM(data.calendar, new Date()), fetchedAt: Date.now() };
    calendarHeld.hold(calendarSpanKey(w), surface);
    (window as unknown as { __CALENDAR?: CalendarSurface }).__CALENDAR = surface;
  },
};
