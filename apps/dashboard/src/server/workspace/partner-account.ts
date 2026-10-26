/**
 * A person's partner account, as the account-scoped partner routes read and change it (decisions 0012, 0014, 0016 and
 * 0020): the account and its ledger, becoming a partner, the daily letter, the invitations from workspaces that ask,
 * and the workspaces a partner sets up for a business and hands to its owner.
 *
 * Every write is a database function that checks the caller (00203, 00209, 00214, 00225); the verbs here map their
 * refusals onto the wire, ask for the session's second factor where a partner's own money or seats are read (0013, M3;
 * 00261 in the database) and tell the owner of a handover (handover.ts). The routes under app/api/v1/partner declare
 * who may, how often and on which scope.
 */
import { requireSecondFactor, type RouteContext } from "@/server/with-route";
import {
  AppError,
  type PartnerBecomeSchema,
  type PartnerLettersSchema,
  cleanPartnerCode,
  type HandoverCreateSchema,
  type HandoverResendSchema,
  type PartnerBalanceRow,
  type PartnerDto,
  type PartnerInvitationDto,
  type PartnerHandoverDto,
  type PartnerWorkspaceMoneyDto,
  type PlatformTenantDto,
} from "@chanlytics/contracts";
import {
  becomePartner,
  getOwnPartner,
  getPartnerBalance,
  getPartnerBroughtCount,
  getPartnerLetters,
  setPartnerLetters,
  getPartnerInvitations,
  acceptPartnerInvite,
  declinePartnerInvite,
  createWorkspaceForBusiness,
  getPartnerHandovers,
  getPartnerWorkspaces,
  resendHandover,
} from "@chanlytics/db";
import { requireUuid } from "@/server/request-guards";
import { notifyPlatformSignup } from "@/server/platform/signup";
import { handoverRefusal, sendHandoverInvite } from "@/server/workspace/handover";
import type { Params } from "@/server/route";
import type { z } from "zod";

export async function readPartnerAccount(
  ctx: RouteContext,
): Promise<{ partner: PartnerDto | null; balance: PartnerBalanceRow[] }> {
  const row = await getOwnPartner(ctx.supabase);
  if (!row) return { partner: null, balance: [] };
  // A partner's own account is read past the second factor, as their seats are (0013, M3; the database answers
  // nothing of the money to a session without it, 00261).
  requireSecondFactor(ctx);
  // The count of workspaces brought is the ledger's (partner_tenants), not the seats held now: a pause or an owner
  // taking the partner off a team changes the seats, never how many the link brought.
  const [balance, brought, letters] = await Promise.all([
    getPartnerBalance(ctx.supabase),
    getPartnerBroughtCount(ctx.supabase, row.id),
    getPartnerLetters(ctx.supabase),
  ]);
  return { partner: { ...(row as PartnerDto), brought, letters }, balance };
}

/** Postgres error codes partner_become raises deliberately, mapped to the wire. */
const RAISED: Record<string, { code: "validation" | "conflict" | "forbidden"; status: number }> = {
  "22023": { code: "validation", status: 400 }, // the code's shape, a reserved word
  "23505": { code: "conflict", status: 409 }, // already a partner, or the code is taken
  "28000": { code: "forbidden", status: 403 }, // no auth.uid() behind the session
};

export async function becomeAPartner(
  ctx: RouteContext,
  input: z.infer<typeof PartnerBecomeSchema>,
): Promise<{ partner: PartnerDto }> {
  // Becoming a partner starts on a session that showed its second factor (0013, M3); partner_become asks again.
  requireSecondFactor(ctx);
  const cleaned = cleanPartnerCode(input.code);
  if (!cleaned.ok) throw new AppError("validation", cleaned.reason);
  const r = await becomePartner(ctx.supabase, cleaned.code);
  if (!r.ok) {
    const mapped = RAISED[r.code];
    if (mapped) throw new AppError(mapped.code, r.message, mapped.status);
    throw new Error(r.message);
  }
  return { partner: r.row as PartnerDto };
}

export async function setPartnerLettersOf(
  ctx: RouteContext,
  input: z.infer<typeof PartnerLettersSchema>,
): Promise<{ letters: boolean }> {
  const r = await setPartnerLetters(ctx.supabase, input.letters);
  if (!r.ok) {
    if (r.code === "P0002") throw new AppError("not_found", r.message, 404);
    if (r.code === "28000") throw new AppError("forbidden", r.message, 403);
    throw new Error(r.message);
  }
  return { letters: r.letters };
}

export async function readPartnerInvitations(ctx: RouteContext): Promise<{ invitations: PartnerInvitationDto[] }> {
  return {
    invitations: (await getPartnerInvitations(ctx.supabase)).map((i) => ({
      workspaceId: i.tenantId,
      workspace: i.workspace,
      sentAt: i.sentAt,
      expiresAt: i.expiresAt,
    })),
  };
}

export async function acceptPartnerInvitation(
  ctx: RouteContext & { params: Params },
): Promise<{ workspace: { id: string; slug: string; name: string }; earns: boolean }> {
  requireSecondFactor(ctx);
  const r = await acceptPartnerInvite(ctx.supabase, requireUuid(ctx.params.id, "workspace"));
  if (!r.ok) throw handoverRefusal(r);
  const { earns, ...joined } = r.value;
  return { workspace: joined, earns };
}

export async function declinePartnerInvitation(ctx: RouteContext & { params: Params }): Promise<{ declined: true }> {
  const r = await declinePartnerInvite(ctx.supabase, requireUuid(ctx.params.id, "workspace"));
  if (!r.ok) throw handoverRefusal(r);
  return { declined: true };
}

export async function readPartnerWorkspaces(ctx: RouteContext): Promise<{
  overview: PlatformTenantDto[];
  money: PartnerWorkspaceMoneyDto[];
  handovers: PartnerHandoverDto[];
}> {
  // What a partner brought is read past the second factor, as their seats are (0013, M3; 00261 in the database).
  if (await getOwnPartner(ctx.supabase)) requireSecondFactor(ctx);
  const [{ overview, money }, handovers] = await Promise.all([
    getPartnerWorkspaces(ctx.supabase),
    getPartnerHandovers(ctx.supabase),
  ]);
  return { overview, money, handovers };
}

export async function setUpWorkspaceForBusiness(
  ctx: RouteContext,
  input: z.infer<typeof HandoverCreateSchema>,
): Promise<{ workspace: { id: string; slug: string; name: string }; sent: boolean }> {
  // The workspace seats the partner as partner: the seat's rule, before it exists (0013, M3; the function asks too).
  requireSecondFactor(ctx);
  const r = await createWorkspaceForBusiness(ctx.supabase, {
    name: input.name,
    timezone: input.timezone ?? null,
    ownerEmail: input.email,
  });
  if (!r.ok) throw handoverRefusal(r);
  // The platform mailbox hears of this workspace as it hears of one an owner makes (workspace-create.ts). Its owner is
  // the address it waits for, never the partner, who never owns it (0016). Best effort, and sent beside the
  // invitation: each is bounded by its own timeout and neither throws, so the partner waits only for the longer.
  const [, sent] = await Promise.all([
    notifyPlatformSignup(r.value.id, input.email, ctx.userId),
    sendHandoverInvite(r.value.id, input.email, ctx.userId),
  ]);
  return { workspace: r.value, sent };
}

export async function resendWorkspaceHandover(
  ctx: RouteContext & { params: Params },
  input: z.infer<typeof HandoverResendSchema>,
): Promise<{ email: string; expiresAt: string; sent: boolean }> {
  requireSecondFactor(ctx);
  const id = requireUuid(ctx.params.id, "workspace");
  const r = await resendHandover(ctx.supabase, id, input.email);
  if (!r.ok) throw handoverRefusal(r);
  const sent = await sendHandoverInvite(id, r.value.email, ctx.userId);
  return { email: r.value.email, expiresAt: r.value.expiresAt, sent };
}
