/**
 * What an address under the Calendar names (decision 0015): `calendar/2026-09-10` opens that day in Day view, `calendar/a-<id>`
 * names a visit, and `calendar/2026-09-10:a-<id>` a visit on its day, which is the one that opens the visit's panel as well as
 * its day (contracts visitRoute writes it, calendarParamParts reads it). The page (app/(os)/w/[workspace]/calendar/[[...param]]/page.tsx)
 * reads it from the path, because a move between two calendar addresses is a pushed entry, never a request for the page that is drawn.
 */
import { calendarParamParts } from "@chanlytics/contracts";

/** The address's param: what follows `calendar/` in the route the path holds, or nothing for the route alone. */
export function calendarParam(route: string | null): string | null {
  return route && route.startsWith("calendar/") ? route.slice("calendar/".length) : null;
}

/** What the page is given by its param: the day it names, and the visit (the id of its row in the record) whose panel it opens. */
export function calendarAddress(param: string | null): { initialVisitId: string | null; initialDay: string | null } {
  const { day, visitId } = calendarParamParts(param);
  return { initialVisitId: visitId, initialDay: day };
}
