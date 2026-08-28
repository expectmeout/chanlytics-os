import { withRoute } from "@/server/with-route";
import { acceptOpenInvites } from "@/server/service";

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
  let { data, error } = await supabase
    .from("tenants")
    .select("id, slug, name, status, timezone")
    .order("name");
  if (error) throw new Error(error.message);

  // First sign-in after an invite: no memberships yet -> accept any open
  // invites for this email, then re-read. Self-healing, no accept endpoint.
  if (!data?.length && (await acceptOpenInvites(userId, email ?? null)) > 0) {
    const retry = await supabase.from("tenants").select("id, slug, name, status, timezone").order("name");
    if (retry.error) throw new Error(retry.error.message);
    data = retry.data;
  }

  // The caller role rides along so the mockup gate() chips tell the truth.
  const { data: mem } = await supabase
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", userId);
  const role = mem?.find((m) => m.tenant_id === data?.[0]?.id)?.role ?? null;
  return { workspaces: data, user: { id: userId, email: email ?? null, role } };
});
