import "server-only";
import { AppError, usageMonthOf, type MetricsSummaryDto, type UsageMonthDto } from "@chanlytics/contracts";
import { usageMonth } from "@chanlytics/db";
import { metricsSummaryFor } from "../metrics/metrics";
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
    // added beside them (server/metrics/metrics.ts), so Today counts every wire.
    const metrics = await metricsSummaryFor(rc.ctx.supabase, tenantId, days);
    if (!metrics) throw new AppError("not_found", "Workspace metrics unavailable.", 404);
    return { data: { metrics, workspaceId: tenantId }, rows: [], stamp: stamp() };
  },
};

/**
 * GET usage, as the route answers it: a workspace's month of metered use from the kept ledger (ai_usage_month over
 * usage_ledger, 00273), each model call with its list-price dollars, each call's seconds, each WhatsApp conversation.
 * Security invoker: RLS decides whose rows it sums, and the workspace scope decides which workspace is asked.
 */
export const usage: Reader<{ month: string }, UsageMonthDto> = {
  name: "usage",
  async read(rc, { month }) {
    const lines = await usageMonth(rc.ctx.supabase, rc.tenantId, `${month}-01`);
    return { data: usageMonthOf(month, lines), rows: [], stamp: stamp() };
  },
};
