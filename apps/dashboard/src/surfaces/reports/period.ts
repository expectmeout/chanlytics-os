/**
 * What Reports shows, changed (moved from legacy-bridge/inbox-verbs.ts, decision 0015): a period by name is kept in this
 * browser; days a member picked are the address's, so they are shared with a link, walked by Back, and never opened on by
 * tomorrow's visit (contracts lensRoute). The read goes through the runner, so the cache, the status and the pill agree
 * with what is on screen.
 */
import { lensRoute, reportRangeKey, reportsRouteParts, type ReportRange } from "@chanlytics/contracts";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { ownsTheScreen } from "@/legacy-bridge/surface-registry";
import { routeOnScreen } from "@/legacy-bridge/workspace";
import { navigate } from "../legacy-verbs";
import { surfaceValue } from "../surface-values";
import { reportsCampaigns } from "./campaigns-surface";
import { headline } from "./headline";
import { reportsPeople } from "./people-surface";
import { receptionist } from "./receptionist-surface";
import { reviews } from "./reviews-surface";
import { keepReportPeriod, paintHeldReports, reportsOverride, shownReportKey, shownReportPeriod } from "./surface";

/**
 * The reads that say what is shown too (period-surface.ts). Each is read behind a pick only when none is held for what it follows or
 * the held one is old, so a pick does not double a read nobody is looking at. `preReads`: Today's line is read behind a pick wherever
 * it was made, so it is right when Today opens; the Reviews, Receptionist, People and Campaigns lenses are read only while the page that
 * draws them is on screen (the Campaigns read is the Overview's too, for one fact), and otherwise as it comes on screen
 * (readWhatWasMissed), a range it does not hold being stale.
 */
const followers = [
  { surface: headline, preReads: true },
  { surface: reviews, preReads: false },
  { surface: receptionist, preReads: false },
  { surface: reportsPeople, preReads: false },
  { surface: reportsCampaigns, preReads: false },
];

/**
 * What is shown moved, to a pick or back from one that failed (`kept`): each read paints what this tab holds for it, and, where it
 * holds none that is fresh, is read behind it where its page is on screen (and, for a pick, where it reads ahead of its page).
 */
function followShown(kept: boolean): void {
  for (const { surface, preReads } of followers) {
    if (kept) surface.paintKept();
    else surface.paintHeld();
    const reads = (preReads && !kept) || ownsTheScreen(surface.override.key, routeOnScreen());
    if (reads && surface.isStale()) void refreshSurfaces([surface.override]);
  }
}

/**
 * The address says a range the report could not read: it takes the one the page shows, in the entry's own place, so the
 * address and the numbers under it are of one range and Back does not return to days that fail again. What follows the
 * range shown (Today's line, the Reviews, Receptionist, People and Campaigns lenses) says that one too: what it read for the range that failed may have
 * landed behind it. The address stays where nothing is shown, or where it is no longer Reports'.
 */
export function backToShown(): void {
  const at = routeOnScreen();
  const here = reportsRouteParts(at);
  const shown = surfaceValue("reports");
  if (here && shown) {
    const to = lensRoute(here.lens, typeof shown.range === "string" ? null : shown.range);
    if (to !== at) navigate(to, { replace: true });
  }
  followShown(true);
}

/**
 * Reports shows this range: whether it does, `false` when its read failed and the page still shows the one it had.
 *
 * The address is moved first, where it says another range than this (a pick; a move the address already made, Back or
 * Forward, moves nothing): to the lens over the days picked, or to the lens alone for a period by name, as a pushed entry
 * so Back walks the ranges a member looked at. Everything after reads what the address says. A pick that fails, or one
 * the report refuses (surface.ts answers with the period kept), puts the period kept back, and the address on the range
 * the page shows.
 */
export async function setReportRange(range: ReportRange): Promise<boolean> {
  const key = reportRangeKey(range);
  const before = routeOnScreen();
  const here = reportsRouteParts(before);
  // What the period kept goes back to where a pick fails: the one the page shows, and on days a member picked (which
  // are no period's) the one kept before the pick. Never the one a caller kept on the way here.
  const prev = surfaceValue("reports")?.period ?? shownReportPeriod();
  if (typeof range === "string") keepReportPeriod(range);
  const to = here ? lensRoute(here.lens, typeof range === "string" ? null : range) : before;
  if (to !== before) navigate(to);
  // Today's line and Worth a look say the period too (the headline), and so do the Reviews, Receptionist, People and Campaigns lenses. One this tab holds paints at once;
  // it is read behind that only when none is held for the range or the held one is old.
  followShown(false);
  // A range this tab has read paints at once; the read behind it keeps it current (the loading standard's held
  // views). Only a range never read waits for its read.
  if (paintHeldReports()) {
    void refreshSurfaces([reportsOverride]);
    return true;
  }
  await refreshSurfaces([reportsOverride]);
  // A newer pick was made while this one loaded: the surface dropped this answer (a range left), and the newer pick decides what
  // the page keeps and says. This one failed nothing, so it takes nothing back.
  if (shownReportKey() !== key) return true;
  // The override writes the range it read. Anything else means the read failed, or the report refused the days and
  // answered with the period, and the page shows another range than this: the period kept and the address go back to
  // it, or the next background refresh would load the new one silently.
  if (surfaceValue("reports")?.key !== key) {
    if (typeof range === "string") keepReportPeriod(prev);
    backToShown();
    return false;
  }
  return true;
}
