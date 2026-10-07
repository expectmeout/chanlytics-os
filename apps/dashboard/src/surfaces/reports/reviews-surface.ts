/**
 * The Reviews override: what customers say in public, read for the Reviews lens alone (contracts `ReviewsReportDto`, `GET
 * reports/reviews`: Google's own read and the ledger of the reviews on record beside it) and folded once into its view model
 * (`toReviewsReportVM`). Part of the SurfaceData seam (legacy-bridge/surface-data.ts); the lens, and the head over it, read what it
 * publishes through `useFollower("reports_reviews")`, so the sentence at the head and the figures under it come from one fold. Only
 * the fold is kept: nothing reads the answer once the view model says what it was of (`state`).
 *
 * It follows the period Reports shows, held by period as the headline is (period-surface.ts): a pick of one this tab has read paints
 * at once, and is read again behind it only if it has aged. Google's own read rides in the answer, and is published as Google's
 * (`publishGoogleRead`), so the lens opens no second read of the same listing.
 *
 * It is read where the lens is drawn and nowhere else: `ROUTE_DRAWS["reports/reviews"]` names it, so the boot's passes, a return to the
 * tab and Retry-all leave it alone on every other page, and the lens reads it as it comes on screen, once and again when it has aged.
 * Its live-feed rule is the lens's own (`onlyOnItsPage`, and Reports owns what it draws: surface-registry.ts): a review seen for
 * the first time, the listing read and the connection synced re-read it while the lens is on screen, and once when it comes back.
 * Only the tables the live feed tells a workspace of can be named (packages/db realtime.ts): the daily readings and the events the
 * ledger counts replies from are not among them, and move no tab on their own; the figures they feed are read with the rest. A write
 * that makes it wrong from another page (Settings' Google verbs, the workspace's zone) forgets it instead of reading it from there
 * (`forgetReviews`, refresh-map.ts).
 */
import { read } from "@/legacy-bridge/api";
import { publishGoogleRead } from "@/legacy-bridge/google";
import { onlyOnItsPage } from "@/legacy-bridge/surface-registry";
import { toReviewsReportVM, type ReportPeriodId, type ReviewsReportVM } from "@chanlytics/contracts";
import { periodSurface } from "./period-surface";

/** What the lens draws from: the fold of the read, and the period it is of (what the control says is chosen, and what the held reads are kept by). */
export interface ReviewsSurface {
  /** The figures, the cards, the waiting rows and every sentence, the head's among them. */
  vm: ReviewsReportVM;
  period: ReportPeriodId;
}

/** The tables whose changes the live feed tells a workspace of and that the Reviews read draws from. */
const REVIEWS_TABLES: string[] = ["google_reviews", "google_listings", "google_connections"];

export const reviews = periodSurface({
  key: "reports_reviews",
  read: async (period): Promise<ReviewsSurface> => {
    const dto = await read("GET reports/reviews", { query: { period } });
    const readAt = Date.now();
    publishGoogleRead(dto.google, readAt);
    return { vm: toReviewsReportVM(dto, { nowMs: readAt }), period };
  },
  // Read again only while the lens is on screen, and once when it comes back (surface-registry.ts).
  live: { refreshOnTables: REVIEWS_TABLES, refreshWhen: onlyOnItsPage("reports_reviews", REVIEWS_TABLES) },
});

export const reviewsOverride = reviews.override;

/** Settings' Google verbs and the workspace's zone changed what the lens counts: nothing is held of it, and it is read as the lens comes on screen. */
export const forgetReviews = reviews.forget;
