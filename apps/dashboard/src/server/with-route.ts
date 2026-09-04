import { NextResponse } from "next/server";
import { AppError, err, ok } from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import { isSameOrigin } from "./request-guards";

export interface RouteContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  email: string | undefined;
}

/**
 * Every /v1 response carries customer transcripts, phone numbers, or an error
 * message shaped by the request. Next defaults these to
 * "public, max-age=0, must-revalidate" — public, on a shared-cache-eligible
 * response. Applied on ALL exits so no path can be forgotten.
 */
const PRIVATE = { "cache-control": "private, no-store" } as const;

/**
 * The one wrapper every /api/v1 handler goes through (Blueprint §4/§8):
 * verified session (getUser, never the cookie JWT alone) -> handler runs on the
 * SESSION-scoPED client so RLS is the enforcement -> envelope + structured log.
 * Service-role never appears here. Next 15 route params (a Promise) are
 * awaited and passed through as ctx.params.
 */
export function withRoute<T>(
  handler: (req: Request, ctx: RouteContext & { params: Record<string, string | string[] | undefined> }) => Promise<T>,
) {
  return async (
    req: Request,
    // Next 15 always passes { params: Promise<SegmentParams> }; the wide
    // non-optional signature satisfies the generated ParamCheck for both
    // static and dynamic routes (runtime still guards defensively).
    routeCtx: { params: Promise<Record<string, string | string[] | undefined>> },
  ): Promise<NextResponse> => {
    const started = Date.now();
    const route = new URL(req.url).pathname;
    try {
      // Cross-site submission, refused before anything else happens.
      //
      // These endpoints authenticate with a cookie, so a form on another site
      // could aim at them. Nothing has stopped that except two accidents:
      // @supabase/ssr defaults its cookies to SameSite=Lax, and vercel.app is
      // on the public-suffix list so a sibling deployment cannot set cookies
      // for this one. Both stop being true on a custom domain shared with
      // anything else. Reads are exempt — they change nothing, and a GET is
      // where a link preview or a prefetch legitimately arrives cross-site.
      if (req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req)) {
        console.log(JSON.stringify({ level: "warn", route, event: "cross_site_write_refused" }));
        return NextResponse.json(
          err("forbidden", "This request did not come from the app."),
          { status: 403, headers: PRIVATE },
        );
      }
      const params = routeCtx?.params ? await routeCtx.params : {};
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json(err("unauthorized", "Sign in required."), { status: 401, headers: PRIVATE });
      }
      const data = await handler(req, { supabase, userId: user.id, email: user.email, params });
      console.log(JSON.stringify({ level: "info", route, user: user.id, ms: Date.now() - started }));
      return NextResponse.json(ok(data), { headers: PRIVATE });
    } catch (e) {
      if (e instanceof AppError) {
        console.log(JSON.stringify({ level: "warn", route, code: e.code, ms: Date.now() - started }));
        return NextResponse.json(err(e.code, e.message, e.details), { status: e.status, headers: PRIVATE });
      }
      console.error(JSON.stringify({ level: "error", route, error: e instanceof Error ? e.message : String(e) }));
      return NextResponse.json(err("internal", "Something went wrong."), { status: 500, headers: PRIVATE });
    }
  };
}

/* ---- Control plane (Session A): who is acting, on which tenant, as what ---- */

export interface MemberContext {
  tenantId: string;
  role: "owner" | "operator" | "viewer";
  /**
   * The caller belongs to more than one workspace and this request did not say
   * which. Reads proceed on the default; WRITES must not — see requireRole.
   */
  ambiguous: boolean;
}

/**
 * THE workspace this request acts on. One resolver, one ordering rule, every
 * route — which is the whole point of it existing.
 *
 * Before this there were three rules and they disagreed: /metrics took
 * tenants[0], /workspaces reported the role of the name-sorted first tenant,
 * and this function took the oldest membership. For anyone in two workspaces
 * the role chip could describe a different tenant than the data underneath it.
 *
 * `wanted` accepts an id or a slug, because /metrics already accepted slugs and
 * nothing else did. RLS (memberships_self_select) means this query can only
 * ever see the caller's own rows, so a workspace they don't belong to resolves
 * to nothing and 404s — never to someone else's tenant.
 */
export async function memberContext(
  ctx: RouteContext,
  wanted?: string | null,
): Promise<MemberContext> {
  const { data, error } = await ctx.supabase
    .from("memberships")
    .select("tenant_id, role, tenants (slug)")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  // Oldest membership. Stable, documented, and now the ONLY default in the
  // codebase — a user's home workspace does not move because a tenant was
  // renamed, which name-sorting allowed.
  const m = wanted
    ? rows.find((r) => r.tenant_id === wanted || r.tenants?.slug === wanted)
    : rows[0];
  if (!m) throw new AppError("not_found", "No workspace found for this account.", 404);

  return {
    tenantId: m.tenant_id,
    role: m.role as MemberContext["role"],
    ambiguous: !wanted && rows.length > 1,
  };
}

const ROLE_RANK: Record<MemberContext["role"], number> = { viewer: 0, operator: 1, owner: 2 };

/**
 * The server-side door (PRD E1). RLS is the floor — it stops cross-tenant
 * reads no matter what — but "which member may flip this switch" is a role
 * decision, and it is made HERE, never in the browser. The client's gate()
 * chips are a courtesy rendering of the same truth.
 */
export function requireRole(member: MemberContext, atLeast: MemberContext["role"]): void {
  // A write must never land in a workspace nobody named. Reads fall back to the
  // caller's default workspace, which is harmless and keeps the app usable; a
  // COMMIT under the same fallback would silently change the wrong business's
  // settings, team or policy. Every mutating path already calls requireRole, so
  // the guard lives here rather than being re-remembered per route.
  if (member.ambiguous) {
    throw new AppError(
      "validation",
      "This account belongs to more than one workspace — say which one before changing anything.",
    );
  }
  if (ROLE_RANK[member.role] < ROLE_RANK[atLeast]) {
    throw new AppError(
      "forbidden",
      atLeast === "owner"
        ? "Only an owner can do this."
        : "Viewers can see everything and change nothing.",
      403,
    );
  }
}
