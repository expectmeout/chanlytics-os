import "server-only";
import type { MonthSent } from "@chanlytics/contracts";
import { campaignMonthSent } from "@chanlytics/db";
import { log } from "../log";
import { serviceDb } from "../service-db";

/**
 * What this workspace's campaigns have sent by email and by text this calendar month, in its own zone (packages/db
 * campaignMonthSent): what its allowance (contracts CAMPAIGN_MONTH_ALLOWANCE) has spent, which the Campaigns head says
 * from half used and the composers say before a send (contracts allowanceBeforeSend, allowanceLine). The count is a
 * function only the service role may call, so it is read here after the route's own scope has named the workspace.
 *
 * A read that fails is said in the log and is null, and the page says nothing of the month rather than a month of
 * nothing: a count that could not be made is not room. `now` is the turn's clock, so the month is the one the page is read in.
 */
export async function monthSentOrNull(tenantId: string, now: Date): Promise<MonthSent | null> {
  try {
    const db = serviceDb();
    const [email, sms] = await Promise.all([
      campaignMonthSent(db, tenantId, "email", now),
      campaignMonthSent(db, tenantId, "sms", now),
    ]);
    return { email, sms };
  } catch (e) {
    log.error("campaign_month_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
