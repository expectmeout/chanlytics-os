import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { report } from "@/server/readers/report";
import { ReportQuery, reportDaysFor } from "@/server/readers/report-period";

/**
 * GET /api/v1/reports?period=7d|30d|90d|month — the receptionist's numbers, day by day.
 *
 * One SECURITY INVOKER function computes the series in the tenant's own time zone under the caller's RLS. The payload spans
 * two periods so the client can show deltas without a second round trip. Only the four periods are accepted: a report that
 * anyone can point at a different window than the one beside it stops agreeing with itself (readers/report-period.ts says
 * what each means, and the `days` the pages sent before). Counted with the other aggregate reads. The body is its reader's
 * (readers/report.ts), which Ask reads too.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery,
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, report, { days: await reportDaysFor(rc, input) })).data;
  },
});
