import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";

/**
 * POST /api/v1/setup/request — {what: "line"}.
 *
 * The owner asks a person at Chanlytics for something the product cannot
 * provision yet. The RPC records it for the workspace's bell and for the
 * platform, once per day per thing. Operators may ask; viewers may not.
 */
export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  await takeRate(ctx.userId, "setup_request");
  const body = (await req.json().catch(() => ({}))) as { what?: unknown };
  const what = typeof body.what === "string" ? body.what : "";
  if (what !== "line") throw new AppError("validation", "Say what you are asking for.", 400);
  const { data, error } = await ctx.supabase.rpc("setup_request", { p_tenant_id: member.tenantId, p_what: what });
  if (error) throw new AppError("conflict", error.message, 409);
  return { request: data };
});
