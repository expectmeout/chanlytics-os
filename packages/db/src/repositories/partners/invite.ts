/** Partner: invite. */

import type { HandoverResult, HandoverWorkspace } from "./handover";
import type { Db } from "./partner";
import type { TenantId } from "@chanlytics/contracts";
import { DbFailure } from "@chanlytics/contracts";

/** The workspace the partner joined, and whether its plan earns them a share. */
export interface PartnerJoined extends HandoverWorkspace {
  earns: boolean;
}

/** The caller, a partner, joins the workspace that asked (00225 partner_invite_accept). */
export async function acceptPartnerInvite(db: Db, tenantId: TenantId): Promise<HandoverResult<PartnerJoined>> {
  const { data, error } = await db.rpc("partner_invite_accept", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, code: "P0002", message: "There is no invitation for you there." };
  return { ok: true, value: { id: row.id, slug: row.slug, name: row.name, earns: row.earns } };
}

/** The caller, a partner, says no (00225 partner_invite_decline). */
export async function declinePartnerInvite(db: Db, tenantId: TenantId): Promise<HandoverResult<null>> {
  const { error } = await db.rpc("partner_invite_decline", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: null };
}

/** What the edge needs to tell a partner a workspace asked for them: to whom, which workspace, until when. */
export interface PartnerInviteMail {
  email: string;
  workspace: string;
  partnerCode: string;
  expiresAt: string;
}

/**
 * An open invitation's facts, for the edge (service role): the address is the partner's own account's, read here,
 * never one a caller passes. Null when the workspace has no open invitation, or the partner has no address left.
 */
export async function getPartnerInviteMail(db: Db, tenantId: TenantId): Promise<PartnerInviteMail | null> {
  const { data, error } = await db
    .from("partner_invitations")
    .select("expires_at, declined_at, tenants(name), partners(code, user_id)")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "getPartnerInviteMail");
  if (!data || data.declined_at || Date.parse(data.expires_at) <= Date.now()) return null;
  const userId = data.partners?.user_id;
  if (!userId) return null;
  const userById = await db.auth.admin.getUserById(userId);
  if (userById.error) throw new DbFailure(userById.error, "getPartnerInviteMail");
  const email = userById.data.user?.email;
  if (!email) return null;
  return {
    email,
    workspace: data.tenants?.name ?? "",
    partnerCode: data.partners?.code ?? "",
    expiresAt: data.expires_at,
  };
}
