import { withRoute } from "@/server/with-route";

/**
 * GET /api/v1/workspaces — the session's tenants, RLS-scoped, plus who is
 * actually signed in.
 *
 * The identity rides along here rather than in its own /me route because the
 * seam already fetches this at boot: the sidebar was hardcoding "Sarah Chen ·
 * sales@chanlytics.com" from the mockup, which is a fabricated person shown as
 * *you* on every page — and it sat one inch from data we spent the whole
 * project making honest.
 */
export const GET = withRoute(async (_req, { supabase, userId, email }) => {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, slug, name, status, timezone")
    .order("name");
  if (error) throw new Error(error.message);
  return { workspaces: data, user: { id: userId, email: email ?? null } };
});
