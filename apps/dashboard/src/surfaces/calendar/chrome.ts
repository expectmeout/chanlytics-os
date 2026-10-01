/**
 * What the frame draws around the Calendar's page (decision 0015; the row of legacy/pages/app-routes.jsx drawCalendar,
 * which left with it): the top bar's one act. A real workspace books through its own link, whichever tool is behind it, and
 * offers nothing until the Calendar has loaded: the demo's Ask detour opened Ask over the skeleton or the failure pane (N10).
 * A demo session, which has read nothing, keeps the Ask door.
 *
 * The crumbs are "Calendar" at every address, `calendar/<YYYY-MM-DD>` too, because the page moves on from the day it opened
 * on. The JSX also named an appointment (`calendar/a-lin`) after the seeded week's; nothing names one now, since the sample
 * the demo draws (sample.ts) has no appointment whose id an address can spell that way.
 */
import { demoSession } from "../legacy-verbs";
import { surfaceValue } from "../surface-values";

interface CalendarAct {
  label: string;
  glyph: string;
  primary: boolean;
  href?: string;
  ask?: boolean;
  testid?: string;
}

/** The crumbs and the act of an address under the Calendar; what it holds is read through the seam, never the window. */
export function calendarChrome(): { crumbs: readonly string[]; act: CalendarAct | null } {
  const live = surfaceValue("calendar");
  const link = live?.vm.bookingLink;
  const act: CalendarAct | null = live
    ? link
      ? { href: link, label: "Booking link", glyph: "calendar", primary: true, testid: "cal-booking-link" }
      : null
    : demoSession()
      ? { ask: true, label: "Book", glyph: "plus", primary: true }
      : null;
  return { crumbs: ["Calendar"], act };
}
