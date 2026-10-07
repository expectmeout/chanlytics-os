/**
 * The Calendar's override: the span the page shows, held between reads, and the bookings over it (moved from
 * legacy-bridge/surfaces/calendar.ts, decision 0015). Part of the SurfaceData seam (legacy-bridge/surface-data.ts); the page
 * reads what it publishes through `useSurface("calendar")`.
 */
import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { getActiveWorkspace, routeOnScreen } from "@/legacy-bridge/workspace";
import { knownZone, workspaceZone } from "@/legacy-bridge/zone";
import { toCalendarVM, windowFor, zoneDayKey, type CalendarVM } from "@chanlytics/contracts";
import { declareSurfaceValue, setSurfaceValue } from "../surface-values";

// Today, Ask, People and the Business tab, which have not moved, still read this under its old name.
declareSurfaceValue("calendar", "__CALENDAR");

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
  setSurfaceValue("calendar", have);
  window.dispatchEvent(new CustomEvent("surface:calendar"));
  return true;
}

/** Windows being read ahead of need, by workspace and span: a board that draws again asks for none twice. */
const warming = new Set<string>();

/**
 * Read a window the board is likely to move to and hold it, so the move paints at once (warm.ts says which). A window
 * already held or already on its way is left alone; a read that fails costs nothing, since the move reads it when it is
 * made; and one that lands after the tab changed workspace is dropped, never held under the other one.
 */
export async function warmCalendar(w: { from: string; days: number }): Promise<void> {
  const key = calendarSpanKey(w);
  const scope = () => `${getActiveWorkspace() ?? "-"}|${key}`;
  const at = scope();
  if (calendarHeld.has(key) || warming.has(at)) return;
  warming.add(at);
  try {
    const data = await read("GET calendar", { query: { from: w.from, days: String(w.days) } });
    if (scope() !== at) return;
    calendarHeld.hold(key, { vm: toCalendarVM(data.calendar, new Date()), fetchedAt: Date.now() });
  } catch {
    /* the move reads it when it is made */
  } finally {
    warming.delete(at);
  }
}

/**
 * Calendar: the owner's calendar as the receptionist reads it — what the feed says is taken, the hours and closures, and
 * the windows a caller would be offered — one span of days by the business's clock. The feed's address never reaches the
 * browser; the route reads it.
 */
export const calendarOverride: SurfaceOverride = {
  key: "calendar",
  value: "calendar",
  events: ["surface:calendar"],
  // A booking that arrived by email is a row written (00345): the board repaints as it lands, without a reload.
  refreshOnTables: ["appointments"],
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
    setSurfaceValue("calendar", surface);
  },
};
