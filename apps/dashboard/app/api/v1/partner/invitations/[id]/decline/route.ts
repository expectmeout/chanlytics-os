import { write, account } from "@/server/route";
import { declinePartnerInvite } from "@chanlytics/db";
import { requireUuid } from "@/server/request-guards";
import { handoverRefusal } from "@/server/workspace/handover";

/**
 * POST /api/v1/partner/invitations/:id/decline — the caller, a partner, says no (decision 0020, 00225
 * partner_invite_decline). The owner sees it on their card and may ask again, or ask someone else.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "partner_invite_answer",
  handle: async ({ ctx }): Promise<{ declined: true }> => {
    const r = await declinePartnerInvite(ctx.supabase, requireUuid(ctx.params.id, "workspace"));
    if (!r.ok) throw handoverRefusal(r);
    return { declined: true };
  },
});
