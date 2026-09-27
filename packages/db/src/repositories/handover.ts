/**
 * A partner sets up a workspace and hands it to its owner (decision 0015). The handover lives on partner_tenants
 * (00214); every write is a function that checks the caller itself, so all of these run on the session client, never
 * the service role. What a function refuses comes back as its code and its own words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

/** An answer from a handover verb: the value, or the function's own code and words. */
export type HandoverResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

const noFunction = (e: { code?: string | null; message: string }): boolean =>
  e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message);

/** A workspace as a handover verb answers it. */
export interface HandoverWorkspace {
  id: string;
  slug: string;
  name: string;
}

/**
 * The calling partner makes a workspace for a business and hands it to `ownerEmail` (00214
 * create_workspace_for_business): seated as partner, credited now, open fourteen days.
 */
export async function createWorkspaceForBusiness(
  db: Db,
  input: { name: string; timezone: string | null; ownerEmail: string },
): Promise<HandoverResult<HandoverWorkspace>> {
  const { data, error } = await db.rpc("create_workspace_for_business", {
    p_name: input.name,
    p_timezone: input.timezone ?? "",
    p_owner_email: input.ownerEmail,
  });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, code: "", message: "The workspace was not made." };
  return { ok: true, value: { id: row.id, slug: row.slug, name: row.name } };
}

/** Where a handover stands after it was sent again. */
export interface HandoverSent {
  email: string;
  sentAt: string;
  expiresAt: string;
}

/** The calling partner sends a handover again, to the same address or another (00214 partner_handover_resend). */
export async function resendHandover(db: Db, tenantId: string, email: string): Promise<HandoverResult<HandoverSent>> {
  const { data, error } = await db.rpc("partner_handover_resend", { p_tenant: tenantId, p_email: email });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    value: { email: String(v.email ?? email), sentAt: String(v.sent_at ?? ""), expiresAt: String(v.expires_at ?? "") },
  };
}

/** A handover waiting for the caller: which workspace, from which partner, open until when. */
export interface OpenHandover {
  tenantId: string;
  workspace: string;
  partnerCode: string;
  expiresAt: string;
}

/**
 * The open handovers addressed to the caller's confirmed email (00214 handovers_mine). None on a database 00214 has
 * not reached, which is true there: nothing can have been handed over. Any other failure reads as none too, and is
 * logged by the caller: the boot this rides on must not fail for it.
 */
export async function getOpenHandovers(db: Db): Promise<{ handovers: OpenHandover[]; error: string | null }> {
  const { data, error } = await Promise.resolve()
    .then(() => db.rpc("handovers_mine"))
    .catch((e: unknown) => ({ data: null, error: { code: "", message: e instanceof Error ? e.message : String(e) } }));
  if (error) return { handovers: [], error: noFunction(error) ? null : error.message };
  return {
    handovers: (data ?? []).map((r) => ({
      tenantId: r.tenant_id,
      workspace: r.workspace,
      partnerCode: r.partner_code,
      expiresAt: r.expires_at,
    })),
    error: null,
  };
}

/** The caller becomes the owner of the workspace handed to them (00214 handover_accept). */
export async function acceptHandover(db: Db, tenantId: string): Promise<HandoverResult<HandoverWorkspace>> {
  const { data, error } = await db.rpc("handover_accept", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, code: "P0002", message: "There is no workspace waiting for you there." };
  return { ok: true, value: { id: row.id, slug: row.slug, name: row.name } };
}

/** The caller says no to the workspace handed to them (00214 handover_decline). */
export async function declineHandover(db: Db, tenantId: string): Promise<HandoverResult<null>> {
  const { error } = await db.rpc("handover_decline", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: null };
}

/** A workspace the caller set up for a business, and where its handover stands. */
export interface PartnerHandoverLine {
  tenantId: string;
  /** Null once the partner can no longer read the workspace (they left its team). */
  name: string | null;
  email: string;
  sentAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
}

/**
 * The handovers of the workspaces the caller set up (partner_tenants, which partner_tenants_partner_select lets them
 * read). None on a database 00214 has not reached, where the columns do not exist yet.
 */
export async function getPartnerHandovers(db: Db): Promise<PartnerHandoverLine[]> {
  const { data, error } = await db
    .from("partner_tenants")
    .select(
      "tenant_id, handover_email, handover_sent_at, handover_expires_at, handover_accepted_at, handover_declined_at, tenants(name)",
    )
    .eq("origin", "handover")
    .order("handover_sent_at", { ascending: false });
  if (error) {
    if (/\b(origin|handover_\w+)\b/.test(error.message) && /does not exist|could not find/i.test(error.message))
      return [];
    throw new Error(`getPartnerHandovers: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    tenantId: r.tenant_id,
    name: r.tenants?.name ?? null,
    email: r.handover_email ?? "",
    sentAt: r.handover_sent_at ?? "",
    expiresAt: r.handover_expires_at ?? "",
    acceptedAt: r.handover_accepted_at,
    declinedAt: r.handover_declined_at,
  }));
}

/** What the edge needs to write a handover's invitation: to whom, which workspace, from which partner, until when. */
export interface HandoverInvite {
  email: string;
  workspace: string;
  partnerCode: string;
  expiresAt: string;
}

/**
 * An open handover's invitation facts, for the edge (service role): the address is the one on record, never one a
 * caller passes, so the door that sends it can write to nobody else. Null when the workspace has no open handover.
 */
export async function getHandoverInvite(db: Db, tenantId: string): Promise<HandoverInvite | null> {
  const { data, error } = await db
    .from("partner_tenants")
    .select(
      "handover_email, handover_expires_at, handover_accepted_at, handover_declined_at, tenants(name), partners(code)",
    )
    .eq("tenant_id", tenantId)
    .eq("origin", "handover")
    .maybeSingle();
  if (error) throw new Error(`getHandoverInvite: ${error.message}`);
  if (!data?.handover_email || !data.handover_expires_at) return null;
  if (data.handover_accepted_at || data.handover_declined_at) return null;
  if (Date.parse(data.handover_expires_at) <= Date.now()) return null;
  return {
    email: data.handover_email,
    workspace: data.tenants?.name ?? "",
    partnerCode: data.partners?.code ?? "",
    expiresAt: data.handover_expires_at,
  };
}
