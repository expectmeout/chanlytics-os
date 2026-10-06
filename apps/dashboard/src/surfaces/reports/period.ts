/**
 * The period Reports shows, changed (moved from legacy-bridge/inbox-verbs.ts, decision 0015): the choice is kept in
 * this browser, and the read goes through the runner, so the cache, the status and the pill agree with what is on screen.
 */
import type { ReportPeriodId } from "@chanlytics/contracts";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { surfaceValue } from "../surface-values";
import { isHeadlineStale, paintHeldHeadline, reportsHeadlineOverride } from "./headline";
import { keepReportPeriod, paintHeldReports, reportsOverride, shownReportPeriod } from "./surface";

/** Whether the period was changed: `false` when its read failed, and the page still shows the one it had. */
export async function setReportRange(period: ReportPeriodId): Promise<boolean> {
  const prev = surfaceValue("reports")?.period ?? period;
  keepReportPeriod(period);
  // Today's line and Worth a look say the period too (the headline). One this tab holds paints at once; it is read behind that
  // only when none is held for the period or the held one is old (headline.ts), so a pick on Reports does not double the heaviest
  // read for a line nobody is looking at. Its sentence always names its own period, so it is never wrong, only a read behind.
  paintHeldHeadline();
  if (isHeadlineStale()) void refreshSurfaces([reportsHeadlineOverride]);
  // A period this tab has read paints at once; the read behind it keeps it current (the loading standard's held
  // views). Only a period never read waits for its read.
  if (paintHeldReports()) {
    void refreshSurfaces([reportsOverride]);
    return true;
  }
  await refreshSurfaces([reportsOverride]);
  // A newer pick was made while this one loaded: the surface dropped this answer (a period left), and the newer pick decides what
  // the page keeps and says. This one failed nothing, so it takes nothing back.
  if (shownReportPeriod() !== period) return true;
  // The override writes the period it fetched. Anything else means the fetch failed and the page is still showing the
  // old period, so the preferred period goes back too, or the next background refresh would load the new one silently.
  if (surfaceValue("reports")?.period !== period) {
    keepReportPeriod(prev);
    // And Today says the period kept: the headline of the period that failed may have landed behind the pick.
    paintHeldHeadline();
    return false;
  }
  return true;
}
