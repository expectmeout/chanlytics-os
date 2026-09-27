/**
 * Partners (decision 0012): the one place the two tables are typed. Reads run on the session client, so RLS
 * decides what comes back: a partner sees their own row and the workspaces they brought; an owner sees who
 * brought theirs. The writes are functions (partner_become, create_workspace) and the service role's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

export type PartnerRow = Database["public"]["Tables"]["partners"]["Row"];
export type PartnerTenantRow = Database["public"]["Tables"]["partner_tenants"]["Row"];

/** The columns the pane reads: never the payout facts, which are the platform's. */
const PARTNER_COLUMNS = "id, code, status, share_bp, terms_accepted_at, created_at";
export type PartnerPublicRow = Pick<
  PartnerRow,
  "id" | "code" | "status" | "share_bp" | "terms_accepted_at" | "created_at"
>;

/** The error a database 00202 has not reached answers a read of the table with. */
const noTable = (message: string): boolean =>
  /\bpartners\b/.test(message) && /does not exist|could not find|schema cache/i.test(message);

/**
 * The caller's own partner row, or null: none, or a database 00202 has not reached, which reads as none so the app
 * boots whichever deploys first. Any other failure is thrown.
 */
export async function getOwnPartner(db: Db): Promise<PartnerPublicRow | null> {
  const { data, error } = await db.from("partners").select(PARTNER_COLUMNS).maybeSingle();
  if (error) {
    if (noTable(error.message)) return null;
    throw new Error(`getOwnPartner: ${error.message}`);
  }
  return data;
}

/**
 * How many workspaces the caller brought (their partner_tenants rows, which partner_tenants_partner_select lets them
 * read): through their link, set up and accepted by an owner (0016), or joined at an owner's invitation (0018); one
 * still waiting for its owner is not brought yet. The same count whether or not they still sit on each team. On a database 00214 has not reached every
 * row is a link's. Null when it cannot be read.
 */
export async function getPartnerBroughtCount(db: Db, partnerId: string): Promise<number | null> {
  const of = () =>
    db.from("partner_tenants").select("tenant_id", { count: "exact", head: true }).eq("partner_id", partnerId);
  const r = await of().or("origin.eq.link,origin.eq.invite,handover_accepted_at.not.is.null");
  if (!r.error) return r.count ?? 0;
  if (!/\b(origin|handover_accepted_at)\b/.test(r.error.message)) return null;
  const older = await of();
  return older.error ? null : (older.count ?? 0);
}

/** One line of the caller's balance: a currency's total in one state, and when the next held one is due. */
export interface PartnerBalanceLine {
  currency: string;
  state: string;
  earned_cents: number;
  next_payable_at: string | null;
}

/**
 * The caller's own totals (00203 partner_balance): held, payable and paid, by currency. Empty on a database 00203
 * has not reached, which reads as nothing earned yet, which is true.
 */
export async function getPartnerBalance(db: Db): Promise<PartnerBalanceLine[]> {
  const { data, error } = await db.rpc("partner_balance");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message))
      return [];
    throw new Error(`getPartnerBalance: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    currency: r.currency,
    state: r.state,
    earned_cents: Number(r.earned_cents),
    next_payable_at: r.next_payable_at ?? null,
  }));
}

/**
 * Whether the caller's daily letter is on (00209 partners.letters): read apart from the row, so a database 00209 has
 * not reached still answers the row, and the letter reads as null (the pane shows no switch).
 */
export async function getPartnerLetters(db: Db): Promise<boolean | null> {
  const { data, error } = await db.from("partners").select("letters").maybeSingle();
  if (error || !data) return null;
  return typeof data.letters === "boolean" ? data.letters : null;
}

/** The caller turns their daily letter on or off (00209 partner_letters_set); the function's own words on a refusal. */
export async function setPartnerLetters(
  db: Db,
  on: boolean,
): Promise<{ ok: true; letters: boolean } | { ok: false; code: string; message: string }> {
  const { data, error } = await db.rpc("partner_letters_set", { p_on: on });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, letters: data === true };
}

/** The caller becomes a partner with this code: the function's own words come back as the error's message. */
export async function becomePartner(
  db: Db,
  code: string,
): Promise<{ ok: true; row: PartnerPublicRow } | { ok: false; code: string; message: string }> {
  const { data, error } = await db.rpc("partner_become", { p_code: code });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, row: data as unknown as PartnerPublicRow };
}

export type PartnerOverviewRow = Database["public"]["Functions"]["partner_overview"]["Returns"][number];
export type PartnerWorkspaceMoneyLine = Database["public"]["Functions"]["partner_workspace_money"]["Returns"][number];

const noFunction = (e: { code?: string | null; message: string }): boolean =>
  e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message);

/**
 * The back office's row for each workspace the caller brought and still sits on the team of (00204
 * partner_overview), and what each they ever brought earned them (partner_workspace_money). Both answer about the
 * caller alone; both read as none on a database 00204 has not reached.
 */
export async function getPartnerWorkspaces(
  db: Db,
): Promise<{ overview: PartnerOverviewRow[]; money: PartnerWorkspaceMoneyLine[] }> {
  const [o, m] = await Promise.all([db.rpc("partner_overview"), db.rpc("partner_workspace_money")]);
  for (const r of [o, m]) {
    if (r.error && !noFunction(r.error)) throw new Error(`getPartnerWorkspaces: ${r.error.message}`);
  }
  return {
    overview: o.error ? [] : (o.data ?? []),
    money: m.error
      ? []
      : (m.data ?? []).map((r) => ({
          ...r,
          held_cents: Number(r.held_cents),
          payable_cents: Number(r.payable_cents),
          paid_cents: Number(r.paid_cents),
          month_cents: Number(r.month_cents),
        })),
  };
}

/* ------------------------------------------------------------------------------ the back office's partner verbs */

export type PlatformPartnerBalanceLine =
  Database["public"]["Functions"]["platform_partner_balances"]["Returns"][number];
export type PlatformPartnerWorkspaceLine =
  Database["public"]["Functions"]["platform_partner_workspaces"]["Returns"][number];

/** An answer from one of the platform's partner verbs: the value, or the function's own code and words. */
export type PartnerVerbResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

/**
 * Every partner and every workspace one brought (00205), for the back office. Both functions check the caller is a
 * platform admin themselves, so this is called on the session client, never the service role. A database 00205 has
 * not reached reads as no partners.
 */
export async function getPlatformPartners(
  db: Db,
): Promise<{ balances: PlatformPartnerBalanceLine[]; workspaces: PlatformPartnerWorkspaceLine[] }> {
  const [b, w] = await Promise.all([db.rpc("platform_partner_balances"), db.rpc("platform_partner_workspaces")]);
  for (const r of [b, w]) {
    if (r.error && !noFunction(r.error)) throw Object.assign(new Error(r.error.message), { code: r.error.code });
  }
  return {
    balances: b.error
      ? []
      : (b.data ?? []).map((r) => ({
          ...r,
          held_cents: Number(r.held_cents),
          payable_cents: Number(r.payable_cents),
          paid_cents: Number(r.paid_cents),
        })),
    workspaces: w.error ? [] : (w.data ?? []),
  };
}

/** A platform admin decides a brought workspace's standing (00205 partner_standing_set). */
export async function setPartnerStanding(
  db: Db,
  tenantId: string,
  standing: string,
  why: string,
): Promise<PartnerVerbResult<{ standing: string; from: string | null; voided: number; matured: number }>> {
  const { data, error } = await db.rpc("partner_standing_set", {
    p_tenant: tenantId,
    p_standing: standing,
    p_why: why,
  });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return {
    ok: true,
    value: data as unknown as { standing: string; from: string | null; voided: number; matured: number },
  };
}

/** What partner_payout_mark answers: paid, or not and why (changed: what is payable moved since it was read). */
export type PartnerPayoutAnswer = {
  paid: boolean;
  changed?: boolean;
  total_cents: number;
  currency: string;
  earnings?: number;
  payout_id?: string;
};

/**
 * A platform admin records a payout sent by hand (00205, 00207 partner_payout_mark). `expectedCents` is what the
 * person saw and sent; the function records nothing when what is payable is no longer that.
 */
export async function markPartnerPaid(
  db: Db,
  partnerId: string,
  currency: string,
  reference: string,
  expectedCents?: number,
): Promise<PartnerVerbResult<PartnerPayoutAnswer>> {
  const { data, error } = await db.rpc("partner_payout_mark", {
    p_partner: partnerId,
    p_currency: currency,
    p_reference: reference,
    ...(expectedCents === undefined ? {} : { p_expected_cents: expectedCents }),
  });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = data as unknown as PartnerPayoutAnswer;
  return { ok: true, value: { ...v, total_cents: Number(v.total_cents) } };
}

/** A platform admin pauses, closes or restores a partner (00206 partner_status_set). */
export async function setPartnerStatus(
  db: Db,
  partnerId: string,
  status: string,
  why: string,
): Promise<PartnerVerbResult<{ status: string; from: string; seats: number }>> {
  const { data, error } = await db.rpc("partner_status_set", { p_partner: partnerId, p_status: status, p_why: why });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: data as unknown as { status: string; from: string; seats: number } };
}

/**
 * A platform admin records the reset of a partner's second factor (00217 partner_second_factor_reset, decision 0013)
 * and learns whose account to act on; the factor itself is removed in Supabase Auth by the caller.
 */
export async function recordPartnerSecondFactorReset(
  db: Db,
  partnerId: string,
  why: string,
): Promise<PartnerVerbResult<string>> {
  const { data, error } = await db.rpc("partner_second_factor_reset", { p_partner: partnerId, p_why: why });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: String(data) };
}

/* ------------------------------------------------------------------------------------------------ handovers */

/*
 * A partner sets up a workspace and hands it to its owner (decision 0016). The handover lives on partner_tenants
 * (00214); every write is a function that checks the caller itself, so all of these run on the session client, never
 * the service role, except getHandoverInvite, the edge's. What a function refuses comes back as its code and words.
 */

/** An answer from a handover verb: the value, or the function's own code and words. */
export type HandoverResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

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

/* ------------------------------------------------------------------------ a workspace asks a partner (0018) */

/**
 * An existing workspace brings in a partner (decision 0018, 00221): its owner names them by code, and they accept.
 * Every write is a function that checks the caller; the verbs below answer the value, or the function's own code and
 * words, as the handover's do.
 */

/** The invitation as the owner's card says it. */
export interface PartnerInviteSent {
  code: string;
  sentAt: string;
  expiresAt: string;
}

/** The owner asks the partner with this code to join the workspace (00221 partner_invite). */
export async function invitePartner(
  db: Db,
  tenantId: string,
  code: string,
): Promise<HandoverResult<PartnerInviteSent>> {
  const { data, error } = await db.rpc("partner_invite", { p_tenant: tenantId, p_code: code });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    value: { code: String(v.code ?? code), sentAt: String(v.sent_at ?? ""), expiresAt: String(v.expires_at ?? "") },
  };
}

/** The owner takes the invitation back before it is answered (00221 partner_invite_withdraw). */
export async function withdrawPartnerInvite(db: Db, tenantId: string): Promise<HandoverResult<null>> {
  const { error } = await db.rpc("partner_invite_withdraw", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: null };
}

/** The workspace's partner and the invitation waiting, as its owner reads them (00221 workspace_partner). */
export interface WorkspacePartner {
  partner: { code: string; origin: string; since: string; seated: boolean } | null;
  invitation: { code: string; sentAt: string; expiresAt: string; declinedAt: string | null } | null;
}

export async function getWorkspacePartner(db: Db, tenantId: string): Promise<HandoverResult<WorkspacePartner>> {
  const { data, error } = await db.rpc("workspace_partner", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = (data ?? {}) as Record<string, Record<string, unknown> | null>;
  const p = v.partner ?? null;
  const i = v.invitation ?? null;
  return {
    ok: true,
    value: {
      partner: p
        ? {
            code: String(p.code ?? ""),
            origin: String(p.origin ?? ""),
            since: String(p.since ?? ""),
            seated: p.seated === true,
          }
        : null,
      invitation: i
        ? {
            code: String(i.code ?? ""),
            sentAt: String(i.sent_at ?? ""),
            expiresAt: String(i.expires_at ?? ""),
            declinedAt: i.declined_at ? String(i.declined_at) : null,
          }
        : null,
    },
  };
}

/** A workspace asking the caller, a partner, to join it. */
export interface PartnerInvitation {
  tenantId: string;
  workspace: string;
  sentAt: string;
  expiresAt: string;
}

/**
 * The open invitations to the calling partner (00221 partner_invitations_mine). None on a database 00221 has not
 * reached, which is true there: nobody can have asked.
 */
export async function getPartnerInvitations(db: Db): Promise<PartnerInvitation[]> {
  const { data, error } = await db.rpc("partner_invitations_mine");
  if (error) {
    if (noFunction(error)) return [];
    throw new Error(`getPartnerInvitations: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    tenantId: r.tenant_id,
    workspace: r.workspace,
    sentAt: r.sent_at,
    expiresAt: r.expires_at,
  }));
}

/** The workspace the partner joined, and whether its plan earns them a share. */
export interface PartnerJoined extends HandoverWorkspace {
  earns: boolean;
}

/** The caller, a partner, joins the workspace that asked (00221 partner_invite_accept). */
export async function acceptPartnerInvite(db: Db, tenantId: string): Promise<HandoverResult<PartnerJoined>> {
  const { data, error } = await db.rpc("partner_invite_accept", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, code: "P0002", message: "There is no invitation for you there." };
  return { ok: true, value: { id: row.id, slug: row.slug, name: row.name, earns: row.earns } };
}

/** The caller, a partner, says no (00221 partner_invite_decline). */
export async function declinePartnerInvite(db: Db, tenantId: string): Promise<HandoverResult<null>> {
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
export async function getPartnerInviteMail(db: Db, tenantId: string): Promise<PartnerInviteMail | null> {
  const { data, error } = await db
    .from("partner_invitations")
    .select("expires_at, declined_at, tenants(name), partners(code, user_id)")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`getPartnerInviteMail: ${error.message}`);
  if (!data || data.declined_at || Date.parse(data.expires_at) <= Date.now()) return null;
  const userId = data.partners?.user_id;
  if (!userId) return null;
  const who = await db.auth.admin.getUserById(userId);
  if (who.error) throw new Error(`getPartnerInviteMail: ${who.error.message}`);
  const email = who.data.user?.email;
  if (!email) return null;
  return {
    email,
    workspace: data.tenants?.name ?? "",
    partnerCode: data.partners?.code ?? "",
    expiresAt: data.expires_at,
  };
}
