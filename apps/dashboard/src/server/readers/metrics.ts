import "server-only";
import { AppError, type MetricsSummaryDto } from "@chanlytics/contracts";
import { metricsSummaryFor } from "../metrics";
import { stamp, type Reader } from "./index";

/**
 * GET metrics, as the route answers it: the numbers behind Today, counted on
 * every wire, for the days the route clamped. A function that answers nothing
 * is the 404 here rather than in the route, so a tool that reads it fails as
 * the page does, never on a silent zero.
 */
export const metrics: Reader<{ days: number }, { metrics: MetricsSummaryDto; workspaceId: string }> = {
  name: "metrics",
  async read(rc, { days }) {
    const tenantId = rc.tenantId;
    // The function answers the routing rows; the workspace's email line is
    // added beside them (server/metrics.ts), so Today counts every wire.
    const metrics = await metricsSummaryFor(rc.ctx.supabase, tenantId, days);
    if (!metrics) throw new AppError("not_found", "Workspace metrics unavailable.", 404);
    return { data: { metrics, workspaceId: tenantId }, rows: [], stamp: stamp() };
  },
};
