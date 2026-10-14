/**
 * What an address under the Calendar names (decision 0015): `calendar/week`, `calendar/day`, `calendar/month` and
 * `calendar/agenda` are its views, the tabs of the frame's strip (chrome.ts); `calendar/2026-09-10` opens that day in Day
 * view; `calendar/a-<id>` names a visit, and `calendar/2026-09-10:a-<id>` a visit on its day, which opens the visit's panel
 * as well as its day. A visit the board opened names the view it was opened over too (`calendar/week:2026-09-10:a-<id>`),
 * so the week stays the week behind it. Contracts' visitRoute writes them and calendarParamParts reads them, the one parse.
 * The page (app/(os)/w/[workspace]/calendar/[[...param]]/page.tsx) reads it from the path, because a move between two
 * calendar addresses is a pushed entry, never a request for the page that is drawn.
 */
import { calendarParamParts, type CalendarView } from "@chanlytics/contracts";
import { crPhone } from "./board-dom";

/** The address's param: what follows `calendar/` in the route the path holds, or nothing for the route alone. */
export function calendarParam(route: string | null): string | null {
  return route && route.startsWith("calendar/") ? route.slice("calendar/".length) : null;
}

/** What the page is given by its param: the day it names, and the visit (the id of its row in the record) whose panel it opens. */
export function calendarAddress(param: string | null): { initialVisitId: string | null; initialDay: string | null } {
  const { day, visitId } = calendarParamParts(param);
  return { initialVisitId: visitId, initialDay: day };
}

/** A view's address, the route its tab moves to. */
export const calendarViewRoute = (view: CalendarView): string => `calendar/${view}`;

/** A day's address: that day, in Day view. */
export const calendarDayRoute = (key: string): string => `calendar/${key}`;

/**
 * Where the board stands with no visit open: the view it shows, on the day the address named, where it named one. What a
 * visit's panel closes back to, when the panel came from a link rather than a press on the board.
 */
export function calendarPlaceRoute(view: CalendarView, day: string | null): string {
  if (!day) return calendarViewRoute(view);
  return view === "day" ? calendarDayRoute(day) : `calendar/${view}:${day}`;
}

/** The view a param names by its word alone (`month`), or null: only that is a pick (keepCalendarView). */
export function calendarViewNamed(param: string | null): CalendarView | null {
  const named = calendarParamParts(param);
  return named.day === null && named.visitId === null ? named.view : null;
}

/** The view last picked on this board, kept in the tab (tab-memory.ts, the loading standard's place), or null. */
function rememberedView(): CalendarView | null {
  const mem = typeof window === "undefined" ? undefined : window.__tabMemory;
  const was = mem?.place("calendar", "board")?.view;
  return calendarParamParts(typeof was === "string" ? was : null).view;
}

/**
 * Keep a view picked for a refresh or a trip to another page. Only a view the address names by its word is a pick (a tab,
 * or Back to one); a day opened from the month, or from a link, is a place the board went to, not a choice, and is not.
 */
export function keepCalendarView(view: CalendarView): void {
  if (typeof window !== "undefined") window.__tabMemory?.keepPlace("calendar", "board", { view });
}

/**
 * The view an address shows: the one it names, Day for a day it names with no view (a bell row's visit, a day pressed in
 * the month), else the view last picked in this tab, else a phone's agenda (a week grid is four times a phone's width) and
 * a desk's week. The frame's strip (chrome.ts) and the page ask this one rule, so the tab lit is the view drawn.
 */
export function calendarViewOf(param: string | null): CalendarView {
  const named = calendarParamParts(param);
  if (named.view) return named.view;
  if (named.day) return "day";
  return rememberedView() ?? (crPhone() ? "agenda" : "week");
}
