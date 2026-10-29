/**
 * What the owner's calendar feed names now, for the send that holds a reminder for a visit the calendar no longer has
 * (S1-05, decision 0002 beside the record).
 *
 * The record of appointments is only as new as the hourly sweep (calendar-sweep.ts): a visit cancelled in the owner's own
 * calendar and nowhere else is `booked` on it until the sweep marks it vanished, and a reminder that goes within that hour
 * would still go. The feed drops a cancelled event at once, and the edge keeps it five minutes (availability.ts
 * feedItemsFor), so a broadcast's batch asks it here, through the jobs context's `calendar` port, and holds a recipient
 * whose visit it no longer names (core broadcast-feed.ts, contracts feedStillNames).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOOKING_DEFAULTS,
  DEFAULT_TIMEZONE,
  calendarFeedKeyOf,
  feedNamesOf,
  parseTenantConfigResult,
  seasonHorizon,
} from "../packages/contracts.js";
import type { FeedNames } from "../packages/contracts.js";
import { getTenantConfig, workspaceZoneOf, type Database } from "../packages/db.js";
import { feedItemsFor } from "./availability.js";

/**
 * The jobs context's `calendar.feedNames` over this runtime's database: null for a workspace with no calendar feed, the names
 * over the span the feed was parsed for otherwise, and a THROW when the feed, or the settings its address is in, cannot be
 * read, so the batch leaves a reminder for a calendar event queued rather than sending it on a guess. A settings row that
 * could not be read is not a workspace without a calendar.
 */
export function feedNamesFor(db: SupabaseClient<Database>) {
  return async (tenantId: string, now: Date): Promise<FeedNames | null> => {
    const [row, zone] = await Promise.all([getTenantConfig(db, tenantId), workspaceZoneOf(db, tenantId)]);
    const parsed = parseTenantConfigResult(row?.config);
    const config = parsed.ok ? parsed.config : null;
    // The grant's calendar where one is read, else the link (contracts calendarFeedKeyOf).
    const url = calendarFeedKeyOf(config);
    if (!url) return null;
    const daysAhead = config?.brain?.profile?.booking_rules?.max_days_ahead ?? BOOKING_DEFAULTS.max_days_ahead;
    const items = await feedItemsFor(tenantId, url, zone || DEFAULT_TIMEZONE, now, daysAhead);
    if (!items) throw new Error("the calendar feed could not be read");
    return feedNamesOf(items, seasonHorizon(now, daysAhead));
  };
}
