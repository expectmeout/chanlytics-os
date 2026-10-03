import { write, account } from "@/server/route";
import { declinePartnerInvitation } from "@/server/workspace/partner-account";

/**
 * POST /api/v1/partner/invitations/:id/decline — the caller, a partner, says no (decision 0020, 00225
 * partner_invite_decline). The owner sees it on their card and may ask again, or ask someone else.
 *
 * The handle is declinePartnerInvitation in src/server/workspace/partner-account.ts: the route is its declaration (who
 * may, how often), the verb is what it does.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "partner_invite_answer",
  handle: ({ ctx }) => declinePartnerInvitation(ctx),
});
