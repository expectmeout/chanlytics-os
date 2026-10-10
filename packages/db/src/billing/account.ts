/**
 * A workspace's billing row (billing_accounts), written through its one door (00379 billing_apply). The edge's billing
 * routines (apps/edge/lib/billing/billing.ts) decide what a reading means with contracts' planBilling and write it here.
 *
 *   applyBilling   the columns a reading or a stamp writes, written only if the row is still what the caller planned
 *                  against (`expect`: the status and updated_at it read; the customer it names, for a customer Stripe
 *                  deleted, so only the row's own is forgotten; null for a write nothing races, a customer's id before
 *                  Checkout or a payment's stamp), and the workspace's switch (`tenantStatus`, null when it
 *                  does not move), in one transaction: a failure between the row and the switch can no longer leave a
 *                  workspace paid and paused. True when the row was written; false when another reading won the
 *                  race, or there is no row, and then nothing moved. A write that fails throws, with the database's
 *                  words, and then nothing moved either.
 *
 * The service role's alone: the door is granted to it and to no other role. The database refuses a column the door
 * does not write (the workspace, its mode, its clock) and a switch tenants' own CHECK refuses, and takes the row's
 * write back with the refusal.
 *
 * Not under repositories/: that folder is at its size, and the billing domain's second module earns this folder.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;
type BillingRow = Database["public"]["Tables"]["billing_accounts"]["Row"];

/** What a reading (contracts planBilling) or a stamp writes: these columns, any of them, and no other. */
export type BillingPatch = Partial<
  Pick<
    BillingRow,
    | "stripe_customer_id"
    | "stripe_subscription_id"
    | "status"
    | "price_id"
    | "current_period_end"
    | "trial_end"
    | "cancel_at"
    | "cancel_at_period_end"
    | "card_brand"
    | "card_last4"
    | "last_payment_failed_at"
    | "last_paid_at"
  >
>;

/** The row as the caller read it, written only while it still is: a reading's status and updated_at, or the customer it names. */
export type BillingExpectation = { status: string; updated_at: string } | { stripe_customer_id: string };

export async function applyBilling(
  db: Db,
  p: {
    tenantId: string;
    row: BillingPatch;
    expect: BillingExpectation | null;
    tenantStatus: "active" | "paused" | null;
  },
): Promise<boolean> {
  const row: Record<string, Json> = {};
  for (const [k, v] of Object.entries(p.row)) if (v !== undefined) row[k] = v;
  const { data, error } = await db.rpc("billing_apply", {
    p_tenant_id: p.tenantId,
    p_row: row,
    ...(p.expect ? { p_expect: { ...p.expect } } : {}),
    ...(p.tenantStatus ? { p_tenant_status: p.tenantStatus } : {}),
  });
  if (error) throw new Error(`billing_apply: ${error.message}`);
  return data === true;
}
