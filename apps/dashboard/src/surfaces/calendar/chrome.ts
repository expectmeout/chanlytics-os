/**
 * What the frame draws around the Calendar's page (decision 0015; the row of legacy/pages/app-routes.jsx drawCalendar,
 * which left with it): its strip of views and the top bar's one act.
 *
 * The views (Week, Day, Month, Agenda) are the frame's strip, the kit's ViewTabs that the Inbox's, People's and Reports'
 * are (surfaces/routes.ts SurfaceViews): the page says which there are and which is picked, the frame draws and moves them,
 * and a tab is a link to the view's address (address.ts). The page drew a segmented control of its own before, restyled
 * to look like the strip, and inside the page's view: it wore the strip's glass a beat late on every arrival, as the view
 * faded in under it (Ruben, 11 Oct 2026).
 *
 * A real workspace has no act: its booking link, and the other things the Calendar offers its owner, are the page's own
 * options menu at the end of its bar (board-parts.tsx), where a lone coral button for one link read as the page's main act
 * (Ruben, 2 Oct 2026). A demo session, which has read nothing, keeps the Ask door: the demo's detour opened Ask over the
 * skeleton or the failure pane when it was offered before the Calendar loaded (N10).
 *
 * The crumbs are "Calendar" at every address, `calendar/<YYYY-MM-DD>` too, because the page moves on from the day it opened
 * on. The JSX also named an appointment (`calendar/a-lin`) after the seeded week's; nothing names one now, since the sample
 * the demo draws (sample.ts) has no appointment whose id an address can spell that way.
 */
import { demoSession } from "../legacy-verbs";
import type { SurfaceViews } from "../routes";
import { surfaceValue } from "../surface-values";
import { calendarViewOf, calendarViewRoute } from "./address";
import { CR_VIEWS } from "./words";

interface CalendarAct {
  label: string;
  glyph: string;
  primary: boolean;
  ask?: boolean;
}

/** The four views, as the frame's strip draws them; the one lit is the one the page draws for this address. */
function calendarViews(param: string | null): SurfaceViews {
  return {
    name: "calendar",
    label: "Calendar view",
    testid: "cal-views",
    picked: calendarViewOf(param),
    tabs: CR_VIEWS.map(([id, label]) => ({ id, label, to: calendarViewRoute(id), testid: `cal-view-${id}` })),
  };
}

/**
 * The crumbs, the mount, the views and the act of an address under the Calendar; what it holds is read through the seam,
 * never the window. One mount for every address: the page follows its address (calendar-page.tsx), so a view picked keeps
 * the days on screen, where a page mounted afresh for each would go back to today.
 */
export function calendarChrome({ param }: { param: string | null }): {
  crumbs: readonly string[];
  mount: string;
  views: SurfaceViews;
  act: CalendarAct | null;
} {
  const act: CalendarAct | null =
    !surfaceValue("calendar") && demoSession() ? { ask: true, label: "Book", glyph: "plus", primary: true } : null;
  return { crumbs: ["Calendar"], mount: "calendar", views: calendarViews(param), act };
}
