/**
 * The Reviews override: what customers say in public, read for the Reviews lens alone (contracts `ReviewsReportDto`, `GET
 * reports/reviews`: Google's own read and the ledger of the reviews on record beside it) and folded once into its view model
 * (`toReviewsReportVM`). Part of the SurfaceData seam (legacy-bridge/surface-data.ts); the lens, and the head over it, read what it
 * publishes through `useSurface("reports_reviews")`, so the sentence at the head and the figures under it come from one fold.
 *
 * It follows the period Reports shows (`shownReportPeriod`, kept in this browser). Held by period, with when each was read, as the
 * headline is: a pick of one this tab has read paints at once (`paintHeldReviews`, called by `setReportRange`), and is read again
 * behind it only if it has aged (`isReviewsStale`).
 *
 * It is read where the lens is drawn and nowhere else: `ROUTE_DRAWS["reports/reviews"]` names it, so the boot's passes, a return to the
 * tab and Retry-all leave it alone on every other page, and the lens reads it as it comes on screen, once and again when it has aged.
 * Its live-feed rule is the lens's own (`onlyOnItsPage`, and Reports owns what it draws: surface-registry.ts): a review seen for
 * the first time, the listing read and the connection synced re-read it while the lens is on screen, and once when it comes back.
 * Only the tables the live feed tells a workspace of can be named (packages/db realtime.ts): the daily readings and the events the
 * ledger counts replies from are not among them, and move no tab on their own; the figures they feed are read with the rest.
 */
import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
import {
  toReviewsReportVM,
  type ReportPeriodId,
  type ReviewsReportDto,
  type ReviewsReportVM,
} from "@chanlytics/contracts";
import { ON_DEMAND_STALE_MS, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { onlyOnItsPage } from "@/legacy-bridge/surface-registry";
import { setSurfaceValue } from "../surface-values";
import { shownReportPeriod } from "./surface";

/** What the lens draws from: the read, its fold, the period it is of and when it was made. */
export interface ReviewsSurface {
  /** What `GET reports/reviews` answered for `period`: Google's own read, and the ledger beside it where a listing is linked. */
  dto: ReviewsReportDto;
  /** The same answer folded once: the figures, the cards, the waiting rows and every sentence, the head's among them. */
  vm: ReviewsReportVM;
  /** The period this is of: what the control says is chosen, and what the held reads are kept by. */
  period: ReportPeriodId;
  fetchedAt: number;
}

/** The periods this tab has read: going back to one paints at once, and a read behind it keeps it current. */
const reviewsHeld = heldViews<ReviewsSurface>(4);

/** The tables whose changes the live feed tells a workspace of and that the Reviews read draws from. */
const REVIEWS_TABLES: string[] = ["google_reviews", "google_listings", "google_connections"];

/** Paint the read this tab holds for the period now shown; whether it did. The read behind it is the caller's. */
export function paintHeldReviews(): boolean {
  const have = reviewsHeld.get(shownReportPeriod());
  if (!have) return false;
  setSurfaceValue("reports_reviews", have);
  window.dispatchEvent(new CustomEvent("surface:reports_reviews"));
  return true;
}

/**
 * Whether the read for the period now shown is held at all, and was made within ON_DEMAND_STALE_MS (the measure every on-demand
 * read is held to: a pick of its period, or the lens's coming on screen, reads it again past it): when not, it wants a read.
 */
export function isReviewsStale(): boolean {
  const have = reviewsHeld.get(shownReportPeriod());
  return !have || Date.now() - have.fetchedAt > ON_DEMAND_STALE_MS;
}

export const reviewsOverride: SurfaceOverride = {
  key: "reports_reviews",
  value: "reports_reviews",
  // Read where the Reviews lens is drawn, as it comes on screen, and again then when it has aged (a pick on the lens keeps it fresh
  // behind the control: period.ts).
  onDemand: true,
  isStale: isReviewsStale,
  events: ["surface:reports_reviews"],
  refreshOnTables: REVIEWS_TABLES,
  // Read again only while the lens is on screen, and once when it comes back (surface-registry.ts).
  refreshWhen: onlyOnItsPage("reports_reviews", REVIEWS_TABLES),
  // A period's reads take their turn; a pick of another period is read at once (activateOverride).
  view: () => shownReportPeriod(),
  apply: async () => {
    const period = shownReportPeriod();
    const dto = await read("GET reports/reviews", { query: { period } });
    const readAt = Date.now();
    const whole: ReviewsSurface = {
      dto,
      vm: toReviewsReportVM(dto, { nowMs: readAt }),
      period,
      fetchedAt: readAt,
    };
    // Held for the period it is of, even if the page has moved on: the read was made, and a pick back to it paints it.
    reviewsHeld.hold(period, whole);
    // A pick of another period while this read was out: its answer is for a period left, and is never painted over the new one.
    if (period !== shownReportPeriod()) return;
    setSurfaceValue("reports_reviews", whole);
  },
};
