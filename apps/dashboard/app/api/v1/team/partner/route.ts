import { read, write, workspace } from "@/server/route";
import { PartnerInviteSchema, partnerCodeFrom, type WorkspacePartnerDto } from "@chanlytics/contracts";
import { getWorkspacePartner, invitePartner, withdrawPartnerInvite } from "@chanlytics/db";
import { handoverRefusal } from "@/server/workspace/handover";
import { sendPartnerInvite } from "@/server/workspace/partner-invite";

/**
 * The workspace's partner, as its owner manages it (decision 0018, 00225). Owner-only, as the rest of the team is:
 * a partner changes the receptionist of the business, so bringing one in is the owner's call.
 */

/** GET /api/v1/team/partner — who the partner is, and the invitation waiting. */
export const GET = read({
  scope: workspace,
  role: "owner",
  handle: async ({ ctx, member }): Promise<WorkspacePartnerDto> => {
    const r = await getWorkspacePartner(ctx.supabase, member.tenantId);
    if (!r.ok) throw handoverRefusal(r);
    return r.value;
  },
});

/**
 * POST /api/v1/team/partner — {code}: ask the partner with this code (or whose link this is) to join, for fourteen
 * days. The partner is told by email; `sent` says whether it went, and the invitation stands either way.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "partner_invite",
  input: PartnerInviteSchema,
  handle: async ({ ctx, member, input }): Promise<{ code: string; expiresAt: string; sent: boolean }> => {
    const r = await invitePartner(ctx.supabase, member.tenantId, partnerCodeFrom(input.code));
    if (!r.ok) throw handoverRefusal(r);
    const sent = await sendPartnerInvite(member.tenantId);
    return { code: r.value.code, expiresAt: r.value.expiresAt, sent };
  },
});

/** DELETE /api/v1/team/partner — take the invitation back before it is answered. */
export const DELETE = write({
  scope: workspace,
  role: "owner",
  rate: "partner_invite",
  handle: async ({ ctx, member }): Promise<{ withdrawn: true }> => {
    const r = await withdrawPartnerInvite(ctx.supabase, member.tenantId);
    if (!r.ok) throw handoverRefusal(r);
    return { withdrawn: true };
  },
});
