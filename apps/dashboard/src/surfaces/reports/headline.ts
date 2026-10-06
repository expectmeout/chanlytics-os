/**
 * The headline override: Today's period line and Worth a look read the period as one small count (contracts
 * `ReportHeadlineVM`, `GET reports/headline`), never the whole report. Part of the SurfaceData seam
 * (legacy-bridge/surface-data.ts); Today reads what it publishes through `useSurface("reports_headline")`.
 *
 * It follows the period Reports shows (`shownReportPeriod`, kept in this browser), as the one `reports` surface did when Today
 * read it, so the line and the leaks say the same last N days Reports prints. Held by period, with when each was read, as Reports'
 * own views are: a pick of one this tab has read paints at once (`paintHeldHeadline`, called by `setReportRange`), and is read
 * again behind it only if it has aged (`isHeadlineStale`).
 *
 * It has no live-feed rule. Its page is Today, whose own surface the live feed re-reads on a message; the headline counts a period
 * of days and reaches for the people pool and the calendar for its booking line, so a message would move it by one in a hundred
 * at the price of the heaviest read there is. The `reports` surface's rule (`onlyOnItsPage`) let every message pass while Today
 * was on screen, so Today's line never moved on one either; this one is read at boot, when the tab returns, by Retry, after the
 * workspace's zone is saved (refresh-map.ts), when the period is picked (period.ts) and, being on-demand, when Today comes on
 * screen after it has aged.
 */
import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
import { MIN_MS, toHeadlineVM, type ReportHeadlineVM } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { setSurfaceValue } from "../surface-values";
import { shownReportPeriod } from "./surface";

/** How old a held headline may be before a pick of its period, or Today's coming on screen, reads it again. */
const HEADLINE_STALE_MS = 5 * MIN_MS;

/** A period's headline, and when this tab read it. */
interface Held {
  vm: ReportHeadlineVM;
  readAt: number;
}

/** The periods this tab has read: going back to one paints at once, and a read behind it keeps it current. */
const headlineHeld = heldViews<Held>(4);

/** Paint the headline this tab holds for the period now shown; whether it did. The read behind it is the caller's. */
export function paintHeldHeadline(): boolean {
  const have = headlineHeld.get(shownReportPeriod());
  if (!have) return false;
  setSurfaceValue("reports_headline", have.vm);
  window.dispatchEvent(new CustomEvent("surface:reports_headline"));
  return true;
}

/** Whether the headline for the period now shown is held at all, and was read within HEADLINE_STALE_MS: when not, it wants a read. */
export function isHeadlineStale(): boolean {
  const have = headlineHeld.get(shownReportPeriod());
  return !have || Date.now() - have.readAt > HEADLINE_STALE_MS;
}

export const reportsHeadlineOverride: SurfaceOverride = {
  key: "reports_headline",
  value: "reports_headline",
  events: ["surface:reports_headline"],
  // A period's reads take their turn; a pick of another period is read at once (activateOverride).
  view: () => shownReportPeriod(),
  apply: async () => {
    const period = shownReportPeriod();
    const { headline } = await read("GET reports/headline", { query: { period } });
    const vm = toHeadlineVM(headline);
    // Held for the period it is of, even if the page has moved on: the read was made, and a pick back to it paints it.
    headlineHeld.hold(period, { vm, readAt: Date.now() });
    // A pick of another period while this read was out: its answer is for a period left, and is never painted over the new one.
    if (period !== shownReportPeriod()) return;
    setSurfaceValue("reports_headline", vm);
  },
};
