import { withRoute } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";

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
export const GET = withRoute(async (req, { supabase }) => {
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 1) || 1));
  const wanted = url.searchParams.get("workspace");

  // RLS returns only workspaces this user belongs to.
  const { data: tenants, error: tErr } = await supabase
    .from("tenants")
    .select("id, slug")
    .order("created_at", { ascending: true });
  if (tErr) throw new Error(tErr.message);

  const tenant = wanted
    ? tenants?.find((t) => t.id === wanted || t.slug === wanted)
    : tenants?.[0];
  if (!tenant) throw new AppError("not_found", "No workspace found for this account.", 404);

  const { data, error } = await supabase.rpc("metrics_summary", {
    p_tenant_id: tenant.id,
    p_days: days,
  });
  if (error) throw new Error(error.message);
  if (!data || (data as { error?: string }).error) {
    throw new AppError("not_found", "Workspace metrics unavailable.", 404);
  }

  return { metrics: data, workspaceId: tenant.id };
});
