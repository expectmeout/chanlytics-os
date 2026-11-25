/**
 * The workspace's partner, as its owner manages it (decision 0020, 00225): who the partner is and the invitation
 * waiting, asking the partner with a code to join for fourteen days (the partner is told by email, partners/invite.ts),
 * and taking the invitation back before it is answered. Owner-only, as the rest of the team is: a partner changes the
 * receptionist of the business, so bringing one in is the owner's call. The route under app/api/v1/team/partner
 * declares who may and how often.
 */
import { type PartnerInviteSchema, partnerCodeFrom, type WorkspacePartnerDto } from "@chanlytics/contracts";
import { getWorkspacePartner, invitePartner, withdrawPartnerInvite } from "@chanlytics/db/partners";
import { handoverRefusal } from "@/server/workspace/handover";
import { sendPartnerInvite } from "@/server/workspace/partner-invite";
import type { RouteContext } from "@/server/shared/with-route";
import type { Member } from "@/server/shared/route";
import type { z } from "zod";

export async function readWorkspacePartner(ctx: RouteContext, member: Member): Promise<WorkspacePartnerDto> {
  const r = await getWorkspacePartner(ctx.supabase, member.tenantId);
  if (!r.ok) throw handoverRefusal(r);
  return toWorkspacePartnerDto(r.value);
}

/** The workspace's partner as the wire says it: the invitation's times in snake_case (docs/naming.md). */
function toWorkspacePartnerDto(read: {
  partner: WorkspacePartnerDto["partner"];
  invitation: WorkspacePartnerInvitation | null;
}): WorkspacePartnerDto {
  const { invitation } = read;
  return {
    partner: read.partner,
    invitation: invitation && {
      code: invitation.code,
      sent_at: invitation.sentAt,
      expires_at: invitation.expiresAt,
      declined_at: invitation.declinedAt,
    },
  };
}

/** An invitation to a partner, as the database's read of it says it. */
interface WorkspacePartnerInvitation {
  code: string;
  sentAt: string;
  expiresAt: string;
  declinedAt: string | null;
}

export async function inviteWorkspacePartner(
  ctx: RouteContext,
  member: Member,
  input: z.infer<typeof PartnerInviteSchema>,
): Promise<{ code: string; expires_at: string; sent: boolean }> {
  const r = await invitePartner(ctx.supabase, member.tenantId, partnerCodeFrom(input.code));
  if (!r.ok) throw handoverRefusal(r);
  const sent = await sendPartnerInvite(member.tenantId, ctx.userId);
  return { code: r.value.code, expires_at: r.value.expiresAt, sent };
}

export async function withdrawWorkspacePartnerInvite(ctx: RouteContext, member: Member): Promise<{ withdrawn: true }> {
  const r = await withdrawPartnerInvite(ctx.supabase, member.tenantId);
  if (!r.ok) throw handoverRefusal(r);
  return { withdrawn: true };
}
