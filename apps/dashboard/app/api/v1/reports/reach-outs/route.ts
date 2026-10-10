import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { reachOutReport } from "@/server/readers/campaign-report";
import { ReportQuery, reportWindowFor } from "@/server/readers/report";

/**
 * GET /api/v1/reports/reach-outs?period=7d|30d|90d|month, or from and to — what the workspace's reach-outs wrote over
 * Reports' window, and what came of it (Reach out Part 6, H1, H3–H6): written, delivered, wrote back, interested,
 * booked, said no and bounced, each reach-out with its steps, replies by angle, sends by domain, and written by day; and
 * each chain's own totals by its root (`chains`), over the same days. The twin of /api/v1/reports/campaigns, over the
 * same windows. The body is its reader's (readers/campaign-report.ts reachOutReport), which Ask's report reads too. Any
 * member.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery,
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, reachOutReport, await reportWindowFor(rc, input))).data;
  },
});
