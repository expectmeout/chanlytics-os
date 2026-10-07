/**
 * The period Reports shows, changed (moved from legacy-bridge/inbox-verbs.ts, decision 0015): the choice is kept in
 * this browser, and the read goes through the runner, so the cache, the status and the pill agree with what is on screen.
 */
import type { ReportPeriodId } from "@chanlytics/contracts";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { ownsTheScreen } from "@/legacy-bridge/surface-registry";
import { routeOnScreen } from "@/legacy-bridge/workspace";
import { surfaceValue } from "../surface-values";
import { headline } from "./headline";
import { reviews } from "./reviews-surface";
import { keepReportPeriod, paintHeldReports, reportsOverride, shownReportPeriod } from "./surface";

/**
 * The reads that say the period too (period-surface.ts). Each is read behind a pick only when none is held for the period or the held
 * one is old, so a pick does not double a read nobody is looking at. `preReads`: Today's line is read behind a pick wherever it was
 * made, so it is right when Today opens; the Reviews lens is read only while it is on screen, and otherwise as it comes on screen
 * (readWhatWasMissed), a period it does not hold being stale.
 */
const followers = [
  { surface: headline, preReads: true },
  { surface: reviews, preReads: false },
];

/**
 * The period shown moved, to a pick or back from one that failed (`kept`): each read paints what this tab holds for it, and, where it
 * holds none that is fresh, is read behind it where its page is on screen (and, for a pick, where it reads ahead of its page).
 */
function followShownPeriod(kept: boolean): void {
  for (const { surface, preReads } of followers) {
    if (kept) surface.paintKept();
    else surface.paintHeld();
    const reads = (preReads && !kept) || ownsTheScreen(surface.override.key, routeOnScreen());
    if (reads && surface.isStale()) void refreshSurfaces([surface.override]);
  }
}

/** Whether the period was changed: `false` when its read failed, and the page still shows the one it had. */
export async function setReportRange(period: ReportPeriodId): Promise<boolean> {
  const prev = surfaceValue("reports")?.period ?? period;
  keepReportPeriod(period);
  // Today's line and Worth a look say the period too (the headline), and so does the Reviews lens. One this tab holds paints at once;
  // it is read behind that only when none is held for the period or the held one is old.
  followShownPeriod(false);
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
    // And what follows it says the period kept: what it read for the period that failed may have landed behind the pick.
    followShownPeriod(true);
    return false;
  }
  return true;
}
