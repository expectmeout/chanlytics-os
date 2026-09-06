import { withRoute, memberContext } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";

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
 * quiet morning. Hence the explicit membership resolution below — an
 * unresolvable workspace is a 404, never a silent zero.
 */
export const GET = withRoute(async (req, ctx) => {
  const { supabase } = ctx;
  await takeRate(ctx.userId, "aggregate");
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 1) || 1));

  // This route used to resolve the workspace itself — tenants ordered by
  // created_at, take the first — which is a THIRD rule, disagreeing with both
  // the membership default and /workspaces' name-sorted one. The numbers on
  // Today could therefore describe a different business than the inbox beside
  // them. memberContext is now the only place that answers this question.
  const { tenantId } = await memberContext(ctx, url.searchParams.get("workspace"));

  const { data, error } = await supabase.rpc("metrics_summary", {
    p_tenant_id: tenantId,
    p_days: days,
  });
  if (error) throw new Error(error.message);
  if (!data || (data as { error?: string }).error) {
    throw new AppError("not_found", "Workspace metrics unavailable.", 404);
  }

  return { metrics: data, workspaceId: tenantId };
});
