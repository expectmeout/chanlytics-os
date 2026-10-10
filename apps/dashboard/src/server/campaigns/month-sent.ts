import "server-only";
import { nextMonthStart, type MonthSent } from "@chanlytics/contracts";
import { campaignMonthSent } from "@chanlytics/db";
import { log } from "../log";
import { serviceDb } from "../service-db";

/**
 * What this workspace's campaigns have sent by email and by text in the calendar month `at` falls in, in its own zone
 * (packages/db campaignMonthSent): what its allowance (contracts CAMPAIGN_MONTH_ALLOWANCE) has spent, which the Campaigns head
 * says from half used and the composers say before a send (contracts allowanceBeforeSend, allowanceLine). The count is a
 * function only the service role may call, so it is read here after the route's own scope has named the workspace.
 *
 * A read that fails is said in the log and is null, and the page says nothing of the month rather than a month of
 * nothing: a count that could not be made is not room.
 */
async function monthSentIn(tenantId: string, at: Date): Promise<MonthSent | null> {
  try {
    const db = serviceDb();
    const [email, sms] = await Promise.all([
      campaignMonthSent(db, tenantId, "email", at),
      campaignMonthSent(db, tenantId, "sms", at),
    ]);
    return { email, sms };
  } catch (e) {
    log.error("campaign_month_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * This calendar month's count. `now` is the turn's clock, so the month is the one the page is read in; Ask's broadcast
 * card passes the time its send is set to go, so the month is the one it goes in, as the send screen counts it.
 */
export function monthSentOrNull(tenantId: string, now: Date): Promise<MonthSent | null> {
  return monthSentIn(tenantId, now);
}

/**
 * The next month's count with the instant it begins, in the workspace's zone `tz`: what a send scheduled past the month's end
 * (a broadcast goes up to thirty days ahead) is counted against, so the composer reads the month at the time it is set to go
 * (contracts monthSentAt), as the enrolment does (core campaigns/allowance.ts, at the run's opening moment). `from` is known
 * whether or not the count could be made, which is null then, and the composer says nothing for that month. A zone that
 * cannot be read gives no next month at all, and the composer judges every send by this month's, as it did.
 */
export async function monthSentNext(
  tenantId: string,
  now: Date,
  tz: string,
): Promise<{ from: number; sent: MonthSent | null } | null> {
  let from: number;
  try {
    from = nextMonthStart(tz, now.getTime());
  } catch (e) {
    log.error("campaign_month_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
  return { from, sent: await monthSentIn(tenantId, new Date(from)) };
}
