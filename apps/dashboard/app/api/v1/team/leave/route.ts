import { write, workspace } from "@/server/route";
import { leaveTeam } from "@/server/workspace/team";

/**
 * POST /api/v1/team/leave — the caller leaves this workspace (00371 team_leave). Any member, an owner too while
 * another owner stays; in the team changes' bucket.
 */
export const POST = write({
  scope: workspace,
  fresh: true,
  role: "viewer",
  rate: "team",
  handle: async ({ ctx, member }) => await leaveTeam(ctx, member.tenantId),
});
