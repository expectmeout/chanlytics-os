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
import { reportRangeKey, toReviewsReportVM, type ReviewsReportVM } from "@chanlytics/contracts";
import { periodSurface } from "./period-surface";
import { rangeQuery, shownReportRange } from "./surface";

/** What the lens draws from: the fold of the read, and the range it is of (what the control says is chosen, and what the held reads are kept by). */
export interface ReviewsSurface {
  /** The figures, the cards, the waiting rows and every sentence, the head's among them. */
  vm: ReviewsReportVM;
  /** The range it is of, by its one name (contracts reportRangeKey): a period's id, or the days a member picked. */
  key: string;
}

export const reviews = periodSurface({
  key: "reports_reviews",
  // The lens is drawn on the page the days are picked on: it follows whatever Reports shows, days a member picked too.
  shown: shownReportRange,
  of: (value) => value.key,
  read: async (range): Promise<ReviewsSurface> => {
    const dto = await read("GET reports/reviews", { query: rangeQuery(range) });
    const readAt = Date.now();
    // Google's own read rides in the answer and is the same whatever days were asked for: published as Google's.
    publishGoogleRead(dto.google, readAt);
    return { vm: toReviewsReportVM(dto, { nowMs: readAt }), key: reportRangeKey(range) };
  },
  // Read again only while the lens is on screen, and once when it comes back (surface-registry.ts). The reviews, and the rule
  // that says whether a review is drafted by the receptionist (the reply box's choice): a teammate's save on Settings › Autonomy
  // reaches the lens open in another tab (the wiring's second audit, W-review-facts-rules-8). A few a month.
  live: { reads: ["review", "rules"], fresh: "its-page" },
});

export const reviewsOverride = reviews.override;

/** Settings' Google verbs and the workspace's zone changed what the lens counts: nothing is held of it, and it is read as the lens comes on screen. */
export const forgetReviews = reviews.forget;
