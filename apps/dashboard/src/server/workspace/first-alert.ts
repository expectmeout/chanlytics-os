import type { SupabaseClient } from "@supabase/supabase-js";
import { putTenantConfig, type Database } from "@chanlytics/db";
import { withFirstAlertAddress, withOwnerAlertAddress, type TenantConfig } from "@chanlytics/contracts";
import { log } from "@/server/log";
import { configRowOf } from "@/server/workspace/config-row";

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
  return saveAlerts(db, tenantId, by, (config) => withFirstAlertAddress(config, email));
}

/**
 * Put the owner's address on the alert list as they accept a workspace a partner
 * set up (handover-answer.ts, 0016; contracts withOwnerAlertAddress): beside any
 * address the partner chose, never in its place, so the business is told about
 * its own customers. The same versioned write, and best effort for the same reason.
 */
export async function giveOwnerAlertAddress(
  db: SupabaseClient<Database>,
  tenantId: string,
  email: string | null | undefined,
  by: string | null,
): Promise<boolean> {
  return saveAlerts(db, tenantId, by, (config) => withOwnerAlertAddress(config, email));
}

/** The row read, the next config made from it, and the versioned write: false when there was nothing to save. */
async function saveAlerts(
  db: SupabaseClient<Database>,
  tenantId: string,
  by: string | null,
  nextOf: (config: unknown) => TenantConfig | null,
): Promise<boolean> {
  try {
    const row = await configRowOf(db, tenantId);
    const next = row ? nextOf(row.config) : null;
    if (!row || !next) return false;
    const put = await putTenantConfig(db, tenantId, next, row.version, by);
    if (!put.ok) log.error("first_alert_address_not_saved", { reason: put.reason });
    return put.ok;
  } catch (e) {
    log.error("first_alert_address_not_saved", { error: e });
    return false;
  }
}
