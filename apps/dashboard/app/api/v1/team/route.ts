import { read, workspace } from "@/server/shared/route";
import { getTeamRoster } from "@/server/workspace/team";

/**
 * GET /api/v1/team — roster + open invites (E1). Membership rows are
 * self-select under RLS, so the roster is assembled server-side AFTER the
 * caller proves membership; emails come from auth.admin, which never reaches
 * the browser except through this shaped response. Every member may read it.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) =>
    // The role is not passed down: getTeamRoster echoed it back untouched and nothing
    // in the app ever read it. The page learns who it is from /api/v1/workspaces.
    await getTeamRoster(ctx.supabase, member.tenantId),
});
