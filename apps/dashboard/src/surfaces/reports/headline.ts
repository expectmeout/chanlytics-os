/**
 * The headline override: Today's period line and Worth a look read the period as one small count (contracts
 * `ReportHeadlineVM`, `GET reports/headline`), never the whole report. Part of the SurfaceData seam
 * (legacy-bridge/surface-data.ts); Today reads what it publishes through `useSurface("reports_headline")`.
 *
 * It follows the period Reports shows, as the one `reports` surface did when Today read it, so the line and the leaks say the same
 * last N days Reports prints (period-surface.ts holds it by period, paints a held one at once on a pick, and reads again behind it
 * only if it has aged).
 *
 * It has no live-feed rule. Its page is Today, whose own surface the live feed re-reads on a message; the headline counts a period
 * of days and reaches for the people pool and the calendar for its booking line, so a message would move it by one in a hundred
 * at the price of the heaviest read there is. The `reports` surface's rule (`onlyOnItsPage`) let every message pass while Today
 * was on screen, so Today's line never moved on one either; this one is read at boot, when the tab returns, by Retry, after the
 * workspace's zone is saved (refresh-map.ts), when the period is picked (period.ts) and, being on-demand, when Today comes on
 * screen after it has aged.
 */
import { read } from "@/legacy-bridge/api";
import { toHeadlineVM } from "@chanlytics/contracts";
import { periodSurface } from "./period-surface";
import { shownReportPeriod } from "./surface";

export const headline = periodSurface({
  key: "reports_headline",
  // Today's line follows the period by name kept in this browser, never days a member picked on Reports: those are
  // one look at one page, and a line that still said them the next morning would be a stale one.
  shown: shownReportPeriod,
  of: (value) => value.period,
  read: async (period) => toHeadlineVM((await read("GET reports/headline", { query: { period } })).headline),
});

export const reportsHeadlineOverride = headline.override;
