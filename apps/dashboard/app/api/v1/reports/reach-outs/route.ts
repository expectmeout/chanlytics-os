import { z } from "zod";
import { read, workspace } from "@/server/route";
import { AppError, REPORT_RANGES } from "@chanlytics/contracts";
import { reachOutReportOf } from "@/server/campaigns/reach-out-report";

const Query = z.object({
  /** 7, 30 or 90; thirty by default. */
  days: z.string().optional(),
});

/**
 * GET /api/v1/reports/reach-outs?days=7|30|90 — what the workspace's reach-outs wrote over Reports' period, and what
 * came of it (Reach out Part 6, H1, H3–H6): written, delivered, wrote back, interested, booked, said no and bounced,
 * each reach-out with its steps, replies by angle, sends by domain, and written by day. The twin of
 * /api/v1/reports/campaigns, over the same three presets. Any member.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const days = Number(input.days ?? 30);
    if (!REPORT_RANGES.some((r) => r.days === days)) {
      throw new AppError("validation", "days must be 7, 30 or 90.");
    }
    return reachOutReportOf(ctx, member.tenantId, days);
  },
});
