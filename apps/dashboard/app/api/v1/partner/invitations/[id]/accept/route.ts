import { write, account } from "@/server/route";
import { acceptPartnerInvitation } from "@/server/workspace/partner-account";

/**
 * POST /api/v1/partner/invitations/:id/accept — the caller, a partner, joins the workspace that asked (decision 0020,
 * 00225 partner_invite_accept): seated as partner, and earning from its plan unless it was already paying. A partner's
 * seat needs a session that showed its second factor (0013), and so does taking one; the function asks again.
 *
 * The handle is acceptPartnerInvitation in src/server/workspace/partner-account.ts: the route is its declaration (who
 * may, how often), the verb is what it does.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "partner_invite_answer",
  handle: ({ ctx }) => acceptPartnerInvitation(ctx),
});
