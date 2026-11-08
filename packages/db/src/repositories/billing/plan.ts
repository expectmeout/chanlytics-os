/**
 * A workspace's plan as the spend rule reads it (decision 0111): its mode and its status. The answer is the database's as
 * it came; the caller decides what it means.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import { platformWide } from "../../shared/tenant-db";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** The workspace's billing mode and status. */
export const findPlanStanding = async (db: Db, tenantId: TenantId) =>
  db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle();

/** The workspace's billing row, whole, or none. */
export const findBillingAccount = async (db: Db, tenantId: TenantId) =>
  db.from("billing_accounts").select("*").eq("tenant_id", tenantId).maybeSingle();

/** The billing row of a Stripe customer, whichever workspace's, or none: Stripe names its customer, not the workspace. */
export const findBillingAccountOfCustomer = async (db: Db, customerId: string) =>
  platformWide(db).from("billing_accounts").select("*").eq("stripe_customer_id", customerId).maybeSingle();

/** The plan as the member's billing page reads it: never a customer or subscription id. */
export const findPlanForPage = async (db: Db, tenantId: TenantId) =>
  db
    .from("billing_accounts")
    .select(
      "mode, status, price_id, current_period_end, trial_end, cancel_at, cancel_at_period_end, card_brand, card_last4, last_payment_failed_at, last_paid_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
