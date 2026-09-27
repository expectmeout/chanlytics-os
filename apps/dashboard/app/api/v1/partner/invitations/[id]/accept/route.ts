import { write, account } from "@/server/route";
import { requireSecondFactor } from "@/server/with-route";
import { acceptPartnerInvite } from "@chanlytics/db";
import { requireUuid } from "@/server/request-guards";
import { handoverRefusal } from "@/server/workspace/handover";

/**
 * POST /api/v1/partner/invitations/:id/accept — the caller, a partner, joins the workspace that asked (decision 0018,
 * 00222 partner_invite_accept): seated as partner, and earning from its plan unless it was already paying. A partner's
 * seat needs a session that showed its second factor (0013), and so does taking one; the function asks again.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "partner_invite_answer",
  handle: async ({ ctx }): Promise<{ workspace: { id: string; slug: string; name: string }; earns: boolean }> => {
    requireSecondFactor(ctx);
    const r = await acceptPartnerInvite(ctx.supabase, requireUuid(ctx.params.id, "workspace"));
    if (!r.ok) throw handoverRefusal(r);
    const { earns, ...joined } = r.value;
    return { workspace: joined, earns };
  },
});
