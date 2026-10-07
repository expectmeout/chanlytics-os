import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { campaignReport } from "@/server/readers/campaign-report";
import { ReportQuery, reportDaysFor } from "@/server/readers/report";

/**
 * GET /api/v1/reports/campaigns?period=7d|30d|90d|month — what the offers earned.
 *
 * The twin of /api/v1/reports: one SECURITY INVOKER function computes the series in the tenant's own time zone under the
 * caller's RLS, over two periods so the page can show a change, plus the current period by playbook or broadcast. The same
 * four periods, for the same reason. The body is its reader's (readers/campaign-report.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery,
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, campaignReport, { days: await reportDaysFor(rc, input) })).data;
  },
});
