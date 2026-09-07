import { withRoute, memberContext } from "@/server/with-route";
import { linesFor, linesStatus } from "@/server/lines";

/**
 * GET /api/v1/lines — the workspace's lines as the page may see them (no
 * provider ids), and whether this deployment can get one, with the costs
 * the page states. Members read.
 */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const [lines, status] = await Promise.all([linesFor(ctx.supabase, member.tenantId), linesStatus()]);
  return { lines, ready: status.ready, provider: status.provider, costs: status.costs };
});
