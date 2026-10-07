/**
 * What the frame draws around the Calendar's page (decision 0015; the row of legacy/pages/app-routes.jsx drawCalendar,
 * which left with it): the top bar's one act. A real workspace has none: its booking link, and the other things the Calendar
 * offers its owner, are the page's own options menu at the end of the bar (board-parts.tsx), where a lone coral button
 * for one link read as the page's main act (Ruben, 2 Oct 2026). A demo session, which has read nothing, keeps the Ask door:
 * the demo's detour opened Ask over the skeleton or the failure pane when it was offered before the Calendar loaded (N10).
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
  ask?: boolean;
}

/** The crumbs and the act of an address under the Calendar; what it holds is read through the seam, never the window. */
export function calendarChrome(): { crumbs: readonly string[]; act: CalendarAct | null } {
  const act: CalendarAct | null =
    !surfaceValue("calendar") && demoSession() ? { ask: true, label: "Book", glyph: "plus", primary: true } : null;
  return { crumbs: ["Calendar"], act };
}
