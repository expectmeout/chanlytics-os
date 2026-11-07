/**
 * Plans that ended, as the line release sweep reads them (decision 0111): every Stripe account in a status the
 * receptionist is off in, and one workspace's account read again just before its number goes. Each answer is the
 * database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;

/** What the release reads of a plan: its status, its dates and its last failed payment. */
const RELEASE_COLUMNS =
  "tenant_id, mode, status, trial_end, current_period_end, cancel_at, last_payment_failed_at, updated_at";

/** Every Stripe account in one of `statuses`, whichever workspace's: the sweep's page. */
export const listStripeAccountsIn = (db: Db, statuses: readonly string[]) =>
  platformWide(db)
    .from("billing_accounts")
    .select(RELEASE_COLUMNS)
    .eq("mode", "stripe")
    .in("status", [...statuses]);

/** One workspace's plan, as the release reads it. */
export const findPlanForRelease = (db: Db, tenantId: string) =>
  db.from("billing_accounts").select(RELEASE_COLUMNS).eq("tenant_id", tenantId).maybeSingle();
