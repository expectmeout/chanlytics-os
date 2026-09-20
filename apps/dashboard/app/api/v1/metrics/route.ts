import { z } from "zod";
import { read, workspace } from "@/server/route";
import { metricsSummaryFor } from "@/server/metrics";
import { AppError } from "@chanlytics/contracts";

const Query = z.object({
  /** 1 to 90; one by default. */
  days: z.string().optional(),
});

/**
 * GET /api/v1/metrics?days=1 — the numbers behind Today.
 *
 * metrics_summary is SECURITY INVOKER, so every count inside it is filtered by
 * the same RLS policies as the rest of the app: no tenant id can be forged
 * through the query string, and a caller who is not a member of the workspace
 * they name gets zeros from a function they were allowed to call rather than
 * someone else's numbers.
 *
 * That property is also a trap worth naming: a WRONG tenant returns a
 * well-formed payload full of zeros, which is indistinguishable from a genuinely
 * quiet morning. Hence the workspace scope: the membership is resolved by the
 * one rule every route shares, and an unresolvable workspace is a 404, never a
 * silent zero. Counted with the other aggregate reads.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const days = Math.min(90, Math.max(1, Number(input.days ?? 1) || 1));
    const tenantId = member.tenantId;
    // The function answers the routing rows; the workspace's email line is
    // added beside them (server/metrics.ts), so Today counts every wire.
    const metrics = await metricsSummaryFor(ctx.supabase, tenantId, days);
    if (!metrics) throw new AppError("not_found", "Workspace metrics unavailable.", 404);
    return { metrics, workspaceId: tenantId };
  },
});
