import { read, workspace } from "@/server/route";
import { teamRoster } from "@/server/service";

/**
 * GET /api/v1/team — roster + open invites (E1). Membership rows are
 * self-select under RLS, so the roster is assembled server-side AFTER the
 * caller proves membership; emails come from auth.admin, which never reaches
 * the browser except through this shaped response. Every member may read it.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) =>
    // The role is not passed down: teamRoster echoed it back untouched and nothing
    // in the app ever read it. The page learns who it is from /api/v1/workspaces.
    await teamRoster(ctx.supabase, member.tenantId),
});
