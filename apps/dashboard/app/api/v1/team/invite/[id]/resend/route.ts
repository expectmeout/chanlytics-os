import { write, workspace } from "@/server/route";
import { resendInvite } from "@/server/workspace/team";
import { requireUuid } from "@/server/request-guards";

/**
 * POST /api/v1/team/invite/:id/resend — an open invitation sent again: seven more days from now and its email
 * (00371 team_invite_renew). Owner-only, and in the invitations' bucket, since it sends one.
 */
export const POST = write({
  scope: workspace,
  fresh: true,
  role: "owner",
  rate: "invite",
  handle: async ({ ctx, member }) => await resendInvite(ctx, member.tenantId, requireUuid(ctx.params.id, "invitation")),
});
