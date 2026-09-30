/**
 * What an address under the Calendar names (decision 0015): `calendar/2026-09-10` opens that day in Day view, and
 * `calendar/a-<id>` names an appointment. The page (app/(os)/w/[workspace]/calendar/[[...param]]/page.tsx) reads it from the
 * path, because a move between two calendar addresses is a pushed entry, never a request for the page that is drawn.
 */

/** The address's param: what follows `calendar/` in the route the path holds, or nothing for the route alone. */
export function calendarParam(route: string | null): string | null {
  return route && route.startsWith("calendar/") ? route.slice("calendar/".length) : null;
}

/** What the page is given by its param: the day it names, and the appointment (which the page does not open). */
export function calendarAddress(param: string | null): { initialApptId: string | null; initialDay: string | null } {
  return {
    initialApptId: param && param.startsWith("a-") ? param : null,
    initialDay: param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : null,
  };
}
