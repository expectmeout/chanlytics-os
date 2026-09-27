import { write, account } from "@/server/route";
import { requireSecondFactor } from "@/server/with-route";
import { HandoverResendSchema } from "@chanlytics/contracts";
import { resendHandover } from "@chanlytics/db";
import { requireUuid } from "@/server/request-guards";
import { handoverRefusal, sendHandoverInvite } from "@/server/workspace/handover";

/**
 * POST /api/v1/partner/workspaces/:id/resend — {email}: the caller sends the handover of a workspace they set up
 * again (decision 0016, 00214 partner_handover_resend), to the same address or another, open fourteen more days.
 * Refused once the workspace has its owner. `sent` says whether the invitation went.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "partner_handover",
  input: HandoverResendSchema,
  handle: async ({ ctx, input }): Promise<{ email: string; expiresAt: string; sent: boolean }> => {
    requireSecondFactor(ctx);
    const id = requireUuid(ctx.params.id, "workspace");
    const r = await resendHandover(ctx.supabase, id, input.email);
    if (!r.ok) throw handoverRefusal(r);
    const sent = await sendHandoverInvite(id, r.value.email);
    return { email: r.value.email, expiresAt: r.value.expiresAt, sent };
  },
});
