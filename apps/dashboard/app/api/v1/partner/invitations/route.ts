import { read, account } from "@/server/route";
import type { PartnerInvitationDto } from "@chanlytics/contracts";
import { getPartnerInvitations } from "@chanlytics/db";

/**
 * GET /api/v1/partner/invitations — the workspaces asking the caller, a partner, to join them (decision 0018, 00220
 * partner_invitations_mine). None for anyone who is not a partner.
 */
export const GET = read({
  scope: account,
  handle: async ({ ctx }): Promise<{ invitations: PartnerInvitationDto[] }> => ({
    invitations: await getPartnerInvitations(ctx.supabase),
  }),
});
