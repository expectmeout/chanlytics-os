import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError, cleanTimezone } from "@chanlytics/contracts";
import { acceptOpenInvites } from "@/server/service";
import { isSameOrigin } from "@/server/request-guards";

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
  // The name this person gave (profiles, 00068) rides with the identity, so
  // the chrome shows a person rather than the workspace standing in for one.
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
  const displayName = profile?.display_name || null;

  // Accept any open invitation for this address, then re-read. Self-healing:
  // there is no accept endpoint to get wrong, and no link that expires into a
  // dead end.
  //
  // This used to run ONLY when the caller had no memberships, which quietly
  // stranded anyone who acquired one first. Self-serve workspace creation made
  // that ordinary rather than exotic: someone invited before they had an
  // account, who signs up and creates their own workspace, holds a membership
  // by the time the invitation is looked at — so it was never honoured, nobody
  // was told, and the owner who sent it saw "pending" forever.
  //
  // It now runs on every workspace read. Migration 00023 adds the partial
  // index that makes that a lookup rather than the sequential scan it was.
  //
  // A GET is exempt from the cross-site check by design (reads change
  // nothing), and this one wrote on the way through. Accepting an invitation
  // is benign and idempotent, but it is a write, so it happens only on the
  // app's own reads: a cross-site GET gets the list and nothing else (F51).
  if (isSameOrigin(_req) && (await acceptOpenInvites(userId, email ?? null)) > 0) {
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
    return { workspaces: [], activeWorkspaceId: null, user: { id: userId, email: email ?? null, role: null, display_name: displayName } };
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
    user: { id: userId, email: email ?? null, role: active.role, display_name: displayName },
  };
});

/**
 * PATCH /api/v1/workspaces — {timezone}. Owner-only.
 *
 * The one field on the tenant row a business owns rather than Chanlytics: the
 * zone its day is measured in. Name, slug and status stay concierge operations
 * -- a slug is a URL and a status is a billing state -- and 00084's column
 * grant enforces that regardless of what this route asks for.
 */
export const PATCH = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  const body = (await req.json().catch(() => null)) as { timezone?: unknown } | null;
  const parsed = cleanTimezone(body?.timezone);
  if (!parsed.ok) throw new AppError("validation", parsed.reason);

  const { data, error } = await ctx.supabase
    .from("tenants")
    .update({ timezone: parsed.tz })
    .eq("id", member.tenantId)
    .select("id, slug, name, status, timezone");
  if (error) throw new Error(error.message);
  // A forbidden UPDATE comes back successful with zero rows in this stack, so
  // the row count IS the permission check. Without this an owner whose policy
  // or grant went missing would be told the zone was saved and see the old one
  // on the next read.
  if (!data?.length) throw new AppError("forbidden", "That workspace's timezone could not be changed.", 403);
  return { workspace: data[0] };
});
