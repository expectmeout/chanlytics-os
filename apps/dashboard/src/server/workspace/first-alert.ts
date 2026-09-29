import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantConfig, putTenantConfig, type Database } from "@chanlytics/db";
import { withFirstAlertAddress } from "@chanlytics/contracts";
import { log, errField } from "@/server/log";

/**
 * Give a workspace just made its creator's address as its first alert address
 * (contracts withFirstAlertAddress), through the same versioned write the
 * settings door uses, so the row records its author and a race is refused.
 *
 * Best effort, like the platform's sign-up notice beside it: the workspace exists
 * whether or not this lands, and Settings › Notifications can always add one.
 * Answers whether the address was saved.
 */
export async function giveFirstAlertAddress(
  db: SupabaseClient<Database>,
  tenantId: string,
  email: string | null | undefined,
  by: string | null,
): Promise<boolean> {
  try {
    const row = await getTenantConfig(db, tenantId);
    const next = row ? withFirstAlertAddress(row.config, email) : null;
    if (!row || !next) return false;
    const put = await putTenantConfig(db, tenantId, next, row.version, by);
    if (!put.ok) log.error("first_alert_address_not_saved", { reason: put.reason });
    return put.ok;
  } catch (e) {
    log.error("first_alert_address_not_saved", { error: errField(e) });
    return false;
  }
}
