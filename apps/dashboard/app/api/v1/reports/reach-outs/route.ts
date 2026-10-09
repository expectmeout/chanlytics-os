import { read, workspace } from "@/server/route";
import { readerContext } from "@/server/readers";
import { ReportQuery, reportWindowFor } from "@/server/readers/report";
import { reachOutReportOf } from "@/server/campaigns/reach-out-report";

/**
 * GET /api/v1/reports/reach-outs?period=7d|30d|90d|month — what the workspace's reach-outs wrote over Reports' period, and
 * what came of it (Reach out Part 6, H1, H3–H6): written, delivered, wrote back, interested, booked, said no and bounced,
 * each reach-out with its steps, replies by angle, sends by domain, and written by day. The twin of
 * /api/v1/reports/campaigns, over the same four periods. Any member.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery,
  handle: async ({ ctx, member, input }) =>
    reachOutReportOf(ctx, member.tenantId, await reportWindowFor(readerContext(ctx, member), input)),
});
