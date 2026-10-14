/**
 * A calendar link that stopped answering, told to its owner once, and the notice closed by the first read that works
 * (the wiring's second audit, R11 S11-4). The receptionist quietly stopped saying which times are open and new visits
 * stopped reaching the Calendar, while the sweep stamped the link as read and counted it in a log line.
 *
 * Since when its reads have failed is kept on the workspace's row (tenant_config.calendar_failed_since, 00434), written
 * by the sweep's own stamp on the change (calendar-sweep.ts). A read failing is routine (a slow feed, the read's own
 * bound), so the owner is told once the failures are contracts CALENDAR_UNREADABLE_TOLD_AFTER_MS old, once per breakage
 * (kept under its start, notify's onceKey), with the door to the link in Settings. A database before 00434 keeps no
 * stamp, and nothing is told from it. Best effort: a notice that could not be kept is logged, and asked again next hour.
 */
import {
  CALENDAR_SETTING_ROUTE,
  CALENDAR_UNREADABLE_TOLD_AFTER_MS,
  CALENDAR_UNREADABLE_WORDS,
} from "../packages/contracts.js";
import type { Database } from "../packages/db.js";
import { mendWarnings, notifyOnce } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { errField, type Logger } from "../log.js";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

/** The owner told that the link stopped answering, once its failures are old enough (see the header). */
export async function tellUnreadable(db: Db, tenantId: string, since: string, now: Date, L: Logger): Promise<void> {
  const sinceMs = Date.parse(since);
  if (now.getTime() - sinceMs < CALENDAR_UNREADABLE_TOLD_AFTER_MS) return;
  try {
    const addressing = await loadTenantNotifications(db, tenantId);
    // Who to tell could not be read: not "nobody". The next hour's failure asks again.
    if (addressing.unread) return;
    await notifyOnce(
      { tenantId, ...addressing },
      {
        kind: "sweep",
        route: CALENDAR_SETTING_ROUTE,
        subject: CALENDAR_UNREADABLE_WORDS.title,
        body: CALENDAR_UNREADABLE_WORDS.body({ sinceMs, nowMs: now.getTime() }),
        redactedBody: "A workspace's calendar link stopped answering.",
        onceKey: `calendar_unreadable:${tenantId}:${since}`,
      },
      { db },
    );
  } catch (e) {
    L.error("calendar_notice_failed", { tenant_id: tenantId, error: errField(e) });
  }
}

/** A read that worked after failures: the notice of the breakage closes (contracts NOTICE_MENDS). Never throws. */
export async function readableAgain(db: Db, tenantId: string): Promise<void> {
  await mendWarnings(db, { tenantId, by: { change: "calendar.readable" }, subject: null, keptId: null });
}
