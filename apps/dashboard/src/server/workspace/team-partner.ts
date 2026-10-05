/**
 * The workspace's partner, as its owner manages it (decision 0020, 00225): who the partner is and the invitation
 * waiting, asking the partner with a code to join for fourteen days (the partner is told by email, partner-invite.ts),
 * and taking the invitation back before it is answered. Owner-only, as the rest of the team is: a partner changes the
 * receptionist of the business, so bringing one in is the owner's call. The route under app/api/v1/team/partner
 * declares who may and how often.
 */
import { type PartnerInviteSchema, partnerCodeFrom, type WorkspacePartnerDto } from "@chanlytics/contracts";
import { getWorkspacePartner, invitePartner, withdrawPartnerInvite } from "@chanlytics/db";
import { handoverRefusal } from "@/server/workspace/handover";
import { sendPartnerInvite } from "@/server/workspace/partner-invite";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";
import type { z } from "zod";

export async function readWorkspacePartner(ctx: RouteContext, member: Member): Promise<WorkspacePartnerDto> {
  const r = await getWorkspacePartner(ctx.supabase, member.tenantId);
  if (!r.ok) throw handoverRefusal(r);
  return r.value;
}

export async function inviteWorkspacePartner(
  ctx: RouteContext,
  member: Member,
  input: z.infer<typeof PartnerInviteSchema>,
): Promise<{ code: string; expiresAt: string; sent: boolean }> {
  const r = await invitePartner(ctx.supabase, member.tenantId, partnerCodeFrom(input.code));
  if (!r.ok) throw handoverRefusal(r);
  const sent = await sendPartnerInvite(member.tenantId, ctx.userId);
  return { code: r.value.code, expiresAt: r.value.expiresAt, sent };
}

export async function withdrawWorkspacePartnerInvite(ctx: RouteContext, member: Member): Promise<{ withdrawn: true }> {
  const r = await withdrawPartnerInvite(ctx.supabase, member.tenantId);
  if (!r.ok) throw handoverRefusal(r);
  return { withdrawn: true };
}
