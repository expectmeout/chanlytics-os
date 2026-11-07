/**
 * What a partner earns from a workspace they brought (decision 0111): the card a workspace paid with marked (one
 * trial a card), the workspace's partner, an earning on an invoice and its reversal, the letters due and written, and
 * the sweep that matures earnings. Each is a door of the partner ledger's; each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;
type Args<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** The card a workspace paid with marked (billing_card_mark). */
export const markBillingCard = (db: Db, tenantId: string, fingerprint: string) =>
  db.rpc("billing_card_mark", { p_tenant_id: tenantId, p_fingerprint: fingerprint });

/** Whether a partner brought the workspace: its row, or none. */
export const findWorkspacePartner = (db: Db, tenantId: string) =>
  db.from("partner_tenants").select("tenant_id").eq("tenant_id", tenantId).maybeSingle();

/** A partner's earning on a paid invoice (partner_earn). */
export const recordPartnerEarning = (db: Db, args: Args<"partner_earn">) => db.rpc("partner_earn", args);

/** A partner's earning on an invoice taken back (partner_reverse). */
export const reversePartnerEarning = (db: Db, args: Args<"partner_reverse">) => db.rpc("partner_reverse", args);

/** The partners' letters due at `now` (partner_letters_due). */
export const listPartnerLettersDue = (db: Db, now: string) => db.rpc("partner_letters_due", { p_now: now });

/** A partner's letter written through `through` (partner_letter_written). */
export const markPartnerLetterWritten = (db: Db, partnerId: string, through: string) =>
  db.rpc("partner_letter_written", { p_partner: partnerId, p_through: through });

/** The partners' earnings matured at `now` (partner_earnings_sweep). */
export const sweepPartnerEarnings = (db: Db, now: string) => db.rpc("partner_earnings_sweep", { p_now: now });
