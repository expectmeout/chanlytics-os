import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { ReportQuery, reportWindowFor, reviewsReport } from "@/server/readers/report";

/**
 * GET /api/v1/reports/reviews?period=7d|30d|90d|month — what customers say in public, from what is stored.
 *
 * The twin of /api/v1/reports/campaigns, over the same four periods: Google's own read (the listing, its newest reviews,
 * its daily readings, as GET /api/v1/google answers it) and, where a listing is linked and the Business Profile has
 * synced, the ledger of the reviews on record beside it, which contracts' toReviewsReportVM folds into the figures, the
 * cards and the sentence at the head. A workspace with no profile answers `ledger: null`, and `readable` says whether
 * the lens has anything to draw; a ledger that cannot be read is this route's failure. `days` is not read: no page sent it
 * to a route that did not exist, so the four periods are all it names (the other report routes read it until 19 October
 * 2026). The body is its reader's (readers/report.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery.pick({ period: true, from: true, to: true }),
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, reviewsReport, await reportWindowFor(rc, input))).data;
  },
});
