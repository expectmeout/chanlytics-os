import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { ReportQuery, reportHeadline, reportPeriodAsked } from "@/server/readers/report";

/**
 * GET /api/v1/reports/headline?period=7d|30d|90d|month — what Today reads of a period: its customer messages and how they compare
 * with the period before, who answered them, its calls and how many of the people who asked have an appointment. The same
 * `report_series` the page's route calls, summed on the server (so Today never loads the report), over the same four periods.
 * The body is its reader's (readers/report.ts), which the Overview reads too from phase C. Counted with the other aggregate
 * reads; any member.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery.pick({ period: true }),
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, reportHeadline, { period: reportPeriodAsked(input) })).data;
  },
});
