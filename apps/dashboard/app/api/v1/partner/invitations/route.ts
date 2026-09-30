import { read, account } from "@/server/route";
import { readPartnerInvitations } from "@/server/workspace/partner-account";

/**
 * GET /api/v1/partner/invitations — the workspaces asking the caller, a partner, to join them (decision 0020, 00225
 * partner_invitations_mine). None for anyone who is not a partner.
 *
 * The handle is readPartnerInvitations in src/server/workspace/partner-account.ts: the route is its declaration (who
 * may, how often), the verb is what it does.
 */
export const GET = read({
  scope: account,
  handle: ({ ctx }) => readPartnerInvitations(ctx),
});
