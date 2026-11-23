import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { ReportQuery, reportWindowFor } from "@/server/readers/report";
import { contentReport } from "@/server/readers/results";

/**
 * GET /api/v1/content/report?period=7d|30d|90d|month, or from and to: Reports' Content lens (00696; the content loop
 * PRD's 9.3, Appendix A.8), over the window every report route reads: the posts up, reached, conversations, booked from
 * a post and it helped, the total, each booking counted once whatever else touched it, and each post's own lines. Any
 * member. The body is its reader's (readers/results.ts contentReport).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery.pick({ period: true, from: true, to: true }),
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, contentReport, await reportWindowFor(rc, input))).data;
  },
});
