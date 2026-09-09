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
  // The role is not passed down: teamRoster echoed it back untouched and nothing
  // in the app ever read it. The page learns who it is from /api/v1/workspaces.
  return await teamRoster(ctx.supabase, member.tenantId);
});
