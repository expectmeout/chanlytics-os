import { withRoute, memberContext } from "@/server/with-route";
import { teamRoster } from "@/server/service";

/**
 * GET /api/v1/team — roster + open invites (E1). Membership rows are
 * self-select under RLS, so the roster is assembled server-side AFTER the
 * caller proves membership; emails come from auth.admin, which never reaches
 * the browser except through this shaped response.
 */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  return await teamRoster(ctx.supabase, member.tenantId, member.role);
});
