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
 * read): through their link, or set up and accepted by an owner (0015); one still waiting for its owner is not
 * brought yet. The same count whether or not they still sit on each team. On a database 00214 has not reached every
 * row is a link's. Null when it cannot be read.
 */
export async function getPartnerBroughtCount(db: Db, partnerId: string): Promise<number | null> {
  const of = () =>
    db.from("partner_tenants").select("tenant_id", { count: "exact", head: true }).eq("partner_id", partnerId);
  const r = await of().or("origin.eq.link,handover_accepted_at.not.is.null");
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
