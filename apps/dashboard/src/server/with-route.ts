import { NextResponse } from "next/server";
import { AppError, err, ok } from "@chanlytics/contracts";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";

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
}

/**
 * Resolve the caller's membership for the workspace this request acts on.
 * RLS (memberships_self_select) means this query can only ever see the
 * caller's own rows — a forged workspace id they don't belong to resolves to
 * nothing and 404s, never to someone else's tenant.
 */
export async function memberContext(
  ctx: RouteContext,
  wanted?: string | null,
): Promise<MemberContext> {
  const { data, error } = await ctx.supabase
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  // Three call sites used to pick a default workspace by three different
  // orderings (oldest membership here, name-sorted tenant in /workspaces,
  // oldest tenant in /metrics), so for a member of two workspaces the role
  // shown and the workspace written could be different tenants — silently.
  // Until there is a switcher, an ambiguous request fails loudly instead.
  if (!wanted && (data?.length ?? 0) > 1) {
    throw new AppError(
      "validation",
      "This account belongs to more than one workspace — the request must name which one.",
    );
  }
  const m = wanted ? data?.find((r) => r.tenant_id === wanted) : data?.[0];
  if (!m) throw new AppError("not_found", "No workspace found for this account.", 404);
  return { tenantId: m.tenant_id, role: m.role as MemberContext["role"] };
}

const ROLE_RANK: Record<MemberContext["role"], number> = { viewer: 0, operator: 1, owner: 2 };

/**
 * The server-side door (PRD E1). RLS is the floor — it stops cross-tenant
 * reads no matter what — but "which member may flip this switch" is a role
 * decision, and it is made HERE, never in the browser. The client's gate()
 * chips are a courtesy rendering of the same truth.
 */
export function requireRole(member: MemberContext, atLeast: MemberContext["role"]): void {
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
