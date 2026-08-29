import { withRoute, memberContext } from "@/server/with-route";
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
export const GET = withRoute(async (_req, ctx) => {
  const { supabase, userId, email } = ctx;
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

  // The caller's role rides along so the mockup gate() chips tell the truth —
  // but the role must describe the workspace actually being VIEWED. This used
  // to report the role for `data[0]`, the name-sorted first tenant, while the
  // rest of the app defaulted to the oldest membership: for anyone in two
  // workspaces the chips could describe one business and the data another.
  // memberContext owns that choice now, so there is one answer.
  //
  // A stale preference must not brick the app: the client remembers the last
  // workspace it was in, and someone removed from that workspace would send an
  // id they are no longer a member of. Everywhere else that is a 404 — here it
  // degrades to their default, because this is the endpoint whose whole job is
  // answering "where am I".
  // Someone with no workspace at all — an invite revoked before first sign-in —
  // must see an empty state, not a 404. This endpoint answers "where am I", and
  // "nowhere yet" is a real answer.
  if (!data?.length) {
    return { workspaces: [], activeWorkspaceId: null, user: { id: userId, email: email ?? null, role: null } };
  }

  const preferred = new URL(_req.url).searchParams.get("workspace");
  const active = await memberContext(ctx, preferred).catch(() =>
    preferred ? memberContext(ctx, null) : Promise.reject(new Error("no workspace")),
  );
  return {
    workspaces: data,
    // Which workspace everything else on this page is scoped to. The client
    // echoes it back as ?workspace= so a reload lands where it left off.
    activeWorkspaceId: active.tenantId,
    user: { id: userId, email: email ?? null, role: active.role },
  };
});
