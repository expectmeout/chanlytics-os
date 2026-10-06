/**
 * The numbers behind Today, and the wires they are counted on.
 *
 * `metrics_summary` answers the routing rows. A workspace's email line is its
 * mailbox and this deployment's mail domain, which the database cannot see,
 * so it is added here, from `emailSetupFor`, the same read Setup and
 * Connections make. For a one-day window the hold the day's replies waited is added too (`reply_hold`: the one rule's count of
 * the replies that went out as the hold ended, later, and with none, from `first_replies`, which both reports read), because the
 * function answers the median and the median of a held reply is the hold. Both readers of the function come through this one door,
 * so the page's Today and Ask's Today count the same lines and say the same speed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOUR_MS, emailWires, holdOf, replyHoldDtoOf, type MetricsSummaryDto } from "@chanlytics/contracts";
import { firstReplies, type Database } from "@chanlytics/db";
import { emailSetupFor } from "../connections/email";
import { log } from "@/server/log";

/** The window the day's replies are read over: Today's one day. A longer window carries none (a period's replies are Reports', report_series). */
const REPLIES_WINDOW_DAYS = 1;

/**
 * How far back the day's replies are read: a local day is at most 25 hours long (a clock put back), so 26 always holds the window's
 * own midnight, which is only known once the function has answered, and the read cannot wait for it.
 */
const REPLIES_LOOKBACK_MS = 26 * HOUR_MS;

type RecentReplies = Awaited<ReturnType<typeof firstReplies>>;

/**
 * The receptionist's replies of the last 26 hours with the hold each waited, read beside the function so no wall clock waits for
 * them. Null when the read failed (logged): the sentence then says the median, as it did.
 */
function recentReplies(supabase: SupabaseClient<Database>, tenantId: string): Promise<RecentReplies | null> {
  return firstReplies(supabase, tenantId, new Date(Date.now() - REPLIES_LOOKBACK_MS)).catch((e: unknown) => {
    log.error("today_replies_read_failed", { error: e });
    return null;
  });
}

/** The hold the window's own replies waited, by the one rule: those the window's midnight keeps. Undefined where none waited one. */
function holdSummary(rows: RecentReplies, since: string): MetricsSummaryDto["reply_hold"] {
  const from = Date.parse(since);
  return replyHoldDtoOf(holdOf(rows.filter((r) => Date.parse(r.asked_at) >= from))) ?? undefined;
}

/** Null when the function answered nothing, or answered its own error; each caller refuses in its own words. */
export async function metricsSummaryFor(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  days: number,
): Promise<MetricsSummaryDto | null> {
  // Together, not waterfalled: one indexed row must not sit behind three
  // plpgsql aggregates on Today's wall clock, and neither must the day's replies.
  const [res, email, recent] = await Promise.all([
    supabase.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: days }),
    // A mailbox that cannot be read is a line that cannot be counted, which is
    // its own state (callsRead is the same shape), never a blank Today and
    // never a count that is short by one.
    emailSetupFor(supabase, tenantId).catch((e: unknown) => {
      log.error("today_email_line_read_failed", { error: e });
      return null;
    }),
    days === REPLIES_WINDOW_DAYS ? recentReplies(supabase, tenantId) : Promise.resolve(null),
  ]);
  if (res.error) throw new Error(res.error.message);
  const answered = res.data as unknown as MetricsSummaryDto | null;
  if (!answered || (answered as unknown as { error?: string }).error) return null;
  const hold = recent === null ? undefined : holdSummary(recent, answered.window.since);
  const dto = hold === undefined ? answered : { ...answered, reply_hold: hold };
  if (email === null) return { ...dto, linesRead: false };
  const wires = emailWires(email);
  // Untouched where there is no email line: a deployment without the channel
  // gets exactly the payload the function answered.
  return wires.length ? { ...dto, channels: [...(dto.channels ?? []), ...wires] } : dto;
}
