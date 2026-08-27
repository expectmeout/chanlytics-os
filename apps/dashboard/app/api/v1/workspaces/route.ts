import { withRoute } from "@/server/with-route";

/**
 * GET /api/v1/workspaces — the session's tenants, RLS-scoped.
 * First consumer: the SurfaceData seam's workspace override (real tenant name
 * replacing the mockup's seeded workspace label).
 */
export const GET = withRoute(async (_req, { supabase }) => {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, slug, name, status, timezone")
    .order("name");
  if (error) throw new Error(error.message);
  return { workspaces: data };
});
