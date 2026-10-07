import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { ReportQuery, reportDaysFor, reviewsReport } from "@/server/readers/report";

/**
 * GET /api/v1/reports/reviews?period=7d|30d|90d|month — what customers say in public, from what is stored.
 *
 * The twin of /api/v1/reports/campaigns, over the same four periods: Google's own read (the listing, its newest reviews,
 * its daily readings, as GET /api/v1/google answers it) and, where a listing is linked, the ledger of the reviews on
 * record beside it, which contracts' toReviewsReportVM folds into the figures, the cards and the sentence at the head. A
 * workspace with no listing answers `ledger: null`; a ledger that cannot be read is this route's failure. The body is
 * its reader's (readers/report.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery,
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, reviewsReport, { days: await reportDaysFor(rc, input) })).data;
  },
});
