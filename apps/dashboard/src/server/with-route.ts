import { NextResponse } from "next/server";
import {
  AppError,
  SPEND_NUMBER,
  err,
  ok,
  whyCannotSpend,
  roleAtLeast,
  seatNeedsSecondFactor,
  secondFactorShown,
  SECOND_FACTOR_WORDS,
  type BillingMode,
  type BillingStatus,
  type Role,
  type SpendWords,
} from "@chanlytics/contracts";
// Relative, not "@/": the alias is a build-tool convenience, and depending on
// one here made this module — which decides who may do what — unimportable by
// anything that is not Next. It is the only such import in src/server, and
// removing it is what lets the permission layer be tested by executing it
// rather than by grepping its source.
import { createClient } from "../lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import { isSameOrigin } from "./request-guards";
import { bearerOf, verifyBearer } from "./bearer";
import { isRetryableAuthError } from "./auth-errors";
import { serverTimingHeader } from "./server-timing";

export interface RouteContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  email: string | undefined;
  /**
   * The auth user's own metadata, as Supabase holds it. What sign-up kept for
   * a person who has not made a workspace yet lives here (the pending
   * workspace, contracts/signup.ts); nothing in it is a permission.
   */
  metadata: Record<string, unknown>;
  /**
   * How the session was signed in: its token's `aal` claim, `aal2` once a second factor was shown (0013). A partner's
   * seat asks for it (memberContext); absent reads as not shown.
   */
  aal?: string;
  /**
   * Where the request came from inside the app, when it says. The Ask
   * palette commits through the same routes a button does; the one thing
   * the ledger should keep is that a card, not a button, was tapped.
   */
  via?: "ask";
  /**
   * The decision this request undoes, when it says so (the x-undo-of header,
   * a decision id). The ledger row the inverse verb records is linked to the
   * row it reverses, so an undo is on the record as one rather than inferred
   * from two rows and a clock.
   */
  undoOf?: string;
}

/**
 * Every /v1 response carries customer transcripts, phone numbers, or an error
 * message shaped by the request. Next defaults these to
 * "public, max-age=0, must-revalidate" — public, on a shared-cache-eligible
 * response. Applied on ALL exits so no path can be forgotten.
 */
const PRIVATE = { "cache-control": "private, no-store" } as const;
/** The answer's own timing beside the cache rule: the session check and the handler, apart (server-timing.ts). */
const timed = (authMs: number, started: number) => ({
  ...PRIVATE,
  "server-timing": serverTimingHeader({ auth: authMs, app: Date.now() - started - authMs }),
});

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
  ): Promise<Response> => {
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
      //
      // A request that carries a bearer token (decision 0011: the phone app's native screens) has no cookie in it
      // and reads none, so there is no ambient credential a foreign page could ride on; the rule is the cookie's.
      const bearer = bearerOf(req);
      if (!bearer && req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req)) {
        console.log(JSON.stringify({ level: "warn", route, event: "cross_site_write_refused" }));
        return NextResponse.json(err("forbidden", "This request did not come from the app."), {
          status: 403,
          headers: PRIVATE,
        });
      }
      const authFrom = Date.now();
      const params = routeCtx?.params ? await routeCtx.params : {};
      // The token's signature verified (proxy.ts says how: locally over the project's public key, or over the Auth
      // server where the project still signs with its shared secret), and its claims: who this is, their address
      // and what they set at sign-up, as the Auth server's user record carried them. Never getSession(). A bearer
      // is verified the same way, over the token the header carried, on a client that reads no cookie.
      const session = bearer ? await verifyBearer(bearer) : await cookieSession();
      const supabase = session.supabase;
      const authErr = session.error;
      const user = session.claims;
      if (!user) {
        // "We could not ask" is not "you are not signed in".
        //
        // The check returns no claims for BOTH a missing session and a network
        // or 5xx failure against Supabase Auth, and this reported 401 either
        // way. The client treats a 401 as a sign-out: it wipes the surface
        // cache — real customer transcripts — and hard-redirects to /login. So
        // a brief auth outage logged every operator out and discarded whatever
        // they were typing. A 503 says try again, and the client leaves the
        // session alone.
        if (isRetryableAuthError(authErr)) {
          console.error(JSON.stringify({ level: "error", route, event: "auth_unavailable", error: authErr?.message }));
          return NextResponse.json(err("upstream_auth", "Could not verify your session just now — try again."), {
            status: 503,
            headers: PRIVATE,
          });
        }
        return NextResponse.json(err("unauthorized", "Sign in required."), { status: 401, headers: PRIVATE });
      }
      const authMs = Date.now() - authFrom;
      const via = req.headers.get("x-via") === "ask" ? ("ask" as const) : undefined;
      const undoOfHeader = req.headers.get("x-undo-of");
      const undoOf =
        undoOfHeader && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(undoOfHeader)
          ? undoOfHeader
          : undefined;
      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      const data = await handler(req, {
        supabase,
        userId: String(user.sub),
        email: typeof user.email === "string" ? user.email : undefined,
        metadata,
        ...(typeof user.aal === "string" ? { aal: user.aal } : {}),
        params,
        ...(via ? { via } : {}),
        ...(undoOf ? { undoOf } : {}),
      });
      console.log(JSON.stringify({ level: "info", route, user: user.sub, ms: Date.now() - started }));
      // A handler that built its own Response — a file to download — passes
      // through as it is. Its cache-control is overwritten with the no-store
      // rule every other exit uses, UNLESS the handler asked for a private
      // cache of its own: the QR code is an image of a number that changes
      // about never, and it was regenerating on every paint because the header
      // it set here was replaced on the way out. Only `private` is honoured, so
      // no exit can be widened to a shared cache by accident.
      if (data instanceof Response) {
        const asked = data.headers.get("cache-control");
        if (!asked || !/^private\b/i.test(asked)) data.headers.set("cache-control", PRIVATE["cache-control"]);
        data.headers.set("server-timing", timed(authMs, started)["server-timing"]);
        return data;
      }
      return NextResponse.json(ok(data), { headers: timed(authMs, started) });
    } catch (e) {
      if (e instanceof AppError) {
        console.log(JSON.stringify({ level: "warn", route, code: e.code, ms: Date.now() - started }));
        return NextResponse.json(err(e.code, e.message, e.details), {
          status: e.status,
          headers: { ...PRIVATE, ...refusalHeaders(e) },
        });
      }
      console.error(JSON.stringify({ level: "error", route, error: e instanceof Error ? e.message : String(e) }));
      return NextResponse.json(err("internal", "Something went wrong."), { status: 500, headers: PRIVATE });
    }
  };
}

/* ---- Control plane (Session A): who is acting, on which tenant, as what ---- */

export interface MemberContext {
  tenantId: string;
  role: Role;
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
export const AMBIGUOUS = "This account belongs to more than one workspace — say which one first.";

export async function memberContext(
  ctx: RouteContext,
  wanted?: string | null,
  /** Only GET /workspaces may fall back to the oldest membership: answering "which workspace should this tab open" is its job. */
  opts: { defaultAllowed?: boolean } = {},
): Promise<MemberContext> {
  const { data, error } = await ctx.supabase
    .from("memberships")
    .select("tenant_id, role, tenants (slug)")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  // A request that names no workspace, from an account that holds two, is
  // refused — on a read as on a write (plan 3.4). The one default left in the
  // codebase is the oldest membership, and only /workspaces may take it: a
  // person's home workspace does not move because a tenant was renamed, which
  // name-sorting allowed.
  if (!wanted && rows.length > 1 && !opts.defaultAllowed) throw new AppError("choose_workspace", AMBIGUOUS);
  const m = wanted ? rows.find((r) => r.tenant_id === wanted || r.tenants?.slug === wanted) : rows[0];
  if (!m) throw new AppError("not_found", "No workspace found for this account.", 404);
  // A partner's seat asks for the second factor (0013, M3), on a read as on a write: the one door every workspace
  // request passes. The database refuses the same session on its own (00216).
  if (seatNeedsSecondFactor(m.role)) requireSecondFactor(ctx);

  return {
    tenantId: m.tenant_id,
    role: m.role as MemberContext["role"],
  };
}

/**
 * A session that has not shown its second factor is refused here (0013, M3): a partner's seat, and the partner
 * account's own doors (becoming one, handing a workspace over). `mfa_required`, so the client sends the tab to the
 * second step rather than saying the role is wrong.
 */
export function requireSecondFactor(ctx: Pick<RouteContext, "aal">): void {
  if (!secondFactorShown(ctx.aal)) throw new AppError("mfa_required", SECOND_FACTOR_WORDS.required, 403);
}

/**
 * The ladder a route's `role` names a rung of, and its one reading, `roleAtLeast`: contracts' (config.ts), so a page
 * that offers an act only to the role its door takes reads the same ladder the door does (Leads' Erase, PR 9).
 * Re-exported here for the doors and Ask's act tools, which have always read it from this module.
 */
export { roleAtLeast };

/**
 * The server-side door (PRD E1). RLS is the floor — it stops cross-tenant
 * reads no matter what — but "which member may flip this switch" is a role
 * decision, and it is made HERE, never in the browser. The client's gate()
 * chips are a courtesy rendering of the same truth.
 *
 * A role the ladder does not know is refused, whatever the door asked for. It
 * used to pass: `ROLE_RANK[unknown] < n` is `undefined < n`, which is false,
 * so a membership row carrying a role this build had never heard of would
 * have walked through every door in the app.
 */
export function requireRole(member: MemberContext, atLeast: Role): void {
  if (!roleAtLeast(member.role, atLeast)) {
    // The least role that may, in the words a member reads. A partner's door
    // says "owner": the partner already passed it, and until a workspace can
    // say whether it has one (0012, P2), "owner" is what is true of every
    // workspace.
    const needs = atLeast === "partner" ? "owner" : atLeast;
    throw new AppError(
      "forbidden",
      needs === "owner" ? "Only an owner can do this." : "Viewers can see everything and change nothing.",
      403,
      // The role the door wanted, so a page can title the refusal "Owner only"
      // rather than guess it from the sentence.
      { needs },
    );
  }
}

/**
 * What a refusal says in its headers. A limit says when it lifts in
 * Retry-After, the header an HTTP client already reads, beside the
 * retry_after_s its envelope carries; the typed client read neither.
 */
export function refusalHeaders(e: AppError): Record<string, string> {
  if (e.code !== "rate_limited") return {};
  const s =
    e.details && typeof e.details === "object" ? (e.details as { retry_after_s?: unknown }).retry_after_s : undefined;
  return typeof s === "number" && Number.isFinite(s) && s >= 0
    ? { "retry-after": String(Math.max(1, Math.ceil(s))) }
    : {};
}

/**
 * The workspace may incur a cost on Chanlytics' own account.
 *
 * A SECOND door beside requireRole, because the two ask different questions:
 * requireRole asks whether this person may act for this workspace, and this
 * asks whether this workspace may spend our money. A route that buys a number
 * or files a carrier registration needs both, and until this existed it had
 * only the first — so an owner of a workspace that had never entered a card
 * could spend $19.50 of the platform's Twilio balance, three times an hour,
 * with every check in the request passing.
 *
 * It lives here rather than in each route for the same reason requireRole does:
 * the next money route will be written by someone who did not read this comment.
 *
 * 402 rather than 403: nothing is wrong with the caller or their permissions,
 * and the fix is a card rather than a different account. The message names the
 * fix, because a refusal at the moment somebody is trying to give you money has
 * to say what to do about it.
 */
export async function requireSpend(
  ctx: RouteContext,
  member: MemberContext,
  doing: SpendWords = SPEND_NUMBER,
): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("billing_accounts")
    .select("mode, status")
    .eq("tenant_id", member.tenantId)
    .maybeSingle();
  // No row is not permission. Every workspace gets one at creation
  // (create_workspace_for), so its absence means something is wrong with this
  // workspace, not that it may spend freely.
  if (error) throw new AppError("internal", "Billing could not be read just now. Try again in a moment.", 503);
  if (!data)
    throw new AppError("payment_required", "This workspace has no billing record. Open Billing to set one up.", 402);
  const why = whyCannotSpend(data.mode as BillingMode, data.status as BillingStatus, doing);
  if (why) throw new AppError("payment_required", why, 402);
}

/** The cookie's session, verified: what every request without a bearer is. */
async function cookieSession() {
  const supabase = await createClient();
  const { data: verified, error } = await supabase.auth.getClaims();
  return {
    supabase,
    claims: (verified?.claims as Record<string, unknown> | undefined) ?? null,
    error: error ?? null,
  };
}
