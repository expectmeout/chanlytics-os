import { read, write, account, workspace } from "@/server/route";
import { memberContext } from "@/server/with-route";
import { AppError, cleanTimezone, pendingWorkspaceOf, providerNameOf, signupPosture } from "@chanlytics/contracts";
import { acceptOpenInvites } from "@/server/service";
import { isPlatformAdmin } from "@/server/platform";
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
 *
 * Declared on the account: this is the endpoint whose whole job is answering
 * "where am I", so it must answer for an account in no workspace yet, and it
 * chooses the active workspace itself, below, by memberContext's one rule
 * with the one degradation that keeps a stale preference from bricking the
 * app.
 */
export const GET = read({
  scope: account,
  handle: async ({ ctx, req: _req }) => {
    const { supabase, userId, email } = ctx;
    let { data, error } = await supabase.from("tenants").select("id, slug, name, status, timezone").order("name");
    if (error) throw new Error(error.message);
    // The name this person gave (profiles, 00068) rides with the identity, so
    // the chrome shows a person rather than the workspace standing in for one.
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    // The name they gave us wins; the name they gave Google (full_name on the
    // auth user) stands in until they do. Never anything made from the email.
    const displayName = profile?.display_name || providerNameOf(ctx.metadata);
    // Whether the back office exists for this person, on the payload the seam
    // already fetches at boot. The nav has to decide synchronously whether the
    // tab is there at all, and a second round trip for one boolean would make
    // the rail flicker for everybody to serve two accounts. It answers only
    // about the caller -- see is_platform_admin() in 00091 for why that is safe
    // to hand every session -- and it is NOT the authorization: every platform
    // route asks the database again.
    const platformAdmin = await isPlatformAdmin(ctx);

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
    // "nowhere yet" is a real answer. It comes with what sign-up kept: the name
    // and clock this person typed before they had proved the inbox, so the
    // create screen opens with them rather than asking twice. Sign-up makes no
    // workspace; this is where every first workspace begins.
    if (!data?.length) {
      // And the sign-up posture, because the create screen is this person's door
      // and it asks the invite code -- or shows the list -- accordingly. Read here
      // so the bridge makes no request of its own for it.
      return {
        workspaces: [],
        activeWorkspaceId: null,
        pending: pendingWorkspaceOf(ctx.metadata),
        posture: signupPosture(process.env.SIGNUP_CODE),
        user: {
          id: userId,
          email: email ?? null,
          role: null,
          display_name: displayName,
          platform_admin: platformAdmin,
        },
      };
    }

    const preferred = new URL(_req.url).searchParams.get("workspace");
    // A STALE PREFERENCE, and nothing else. memberContext throws two things:
    // an AppError("not_found") when the named workspace is not one of this
    // account's -- someone was removed from the workspace their tab remembers,
    // which is the degradation this fallback is for -- and a plain Error when
    // the memberships read itself failed. Catching both sent a momentary read
    // failure to the OLDEST membership instead, and the client echoes
    // activeWorkspaceId back on every later call: the operator would be working
    // in a different business's inbox with nothing on screen saying so. A
    // rejection that is not the stale preference is re-thrown with its own
    // cause, rather than replaced by a bare "no workspace" behind a 500.
    const active = await memberContext(ctx, preferred, { defaultAllowed: true }).catch((e: unknown) => {
      if (!preferred || !(e instanceof AppError) || e.code !== "not_found") throw e;
      return memberContext(ctx, null, { defaultAllowed: true });
    });
    return {
      workspaces: data,
      // Which workspace everything else on this page is scoped to. The client
      // echoes it back as ?workspace= so a reload lands where it left off.
      activeWorkspaceId: active.tenantId,
      user: {
        id: userId,
        email: email ?? null,
        role: active.role,
        display_name: displayName,
        platform_admin: platformAdmin,
      },
    };
  },
});

/**
 * PATCH /api/v1/workspaces — {timezone}. Owner-only, and no bucket, said out
 * loud: the zone is set once and read forever.
 *
 * The one field on the tenant row a business owns rather than Chanlytics: the
 * zone its day is measured in. Name, slug and status stay concierge operations
 * -- a slug is a URL and a status is a billing state -- and 00084's column
 * grant enforces that regardless of what this route asks for.
 */
export const PATCH = write({
  scope: workspace,
  role: "owner",
  rate: null,
  handle: async ({ ctx, req, member }) => {
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
  },
});
