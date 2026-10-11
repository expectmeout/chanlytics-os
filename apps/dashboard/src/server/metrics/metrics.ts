/**
 * The numbers behind Today, and the wires they are counted on.
 *
 * `metrics_summary` answers the routing rows. A workspace's email line is its
 * mailbox and this deployment's mail domain, which the database cannot see,
 * so it is added here, from `emailLineFor`, the judgement Setup and
 * Connections make with the rest of what they say of email. For a one-day window the hold the day's replies waited is added too
 * (`reply_hold`: the one rule's count of the replies that went out as the hold ended, later, and with none), because the function
 * answers the median and the median of a held reply is the hold. The replies are the function's own (`replies`, 00359: the rows it
 * read to count who answered), where it answers them; a database the migration has not reached is asked `first_replies` for them
 * after it, as every read of Today was asked beside it. Both readers of the function come through this one door, so the page's
 * Today and Ask's Today count the same lines and say the same speed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOUR_MS, emailWires, holdOf, replyHoldDtoOf, type MetricsSummaryDto } from "@chanlytics/contracts";
import { firstReplies, type Database } from "@chanlytics/db";
import { emailLineFor } from "../connections/email";
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
 * The receptionist's replies of the last 26 hours with the hold each waited, asked of `first_replies` itself: only where the
 * function's answer carried none (a database before 00359). Null when the read failed (logged): the sentence then says the
 * median, as it did.
 */
function recentReplies(supabase: SupabaseClient<Database>, tenantId: string): Promise<RecentReplies | null> {
  return firstReplies(supabase, tenantId, new Date(Date.now() - REPLIES_LOOKBACK_MS)).catch((e: unknown) => {
    log.error("today_replies_read_failed", { error: e });
    return null;
  });
}

/**
 * The day's replies as the function answers them (`replies`, 00359), in the shape `first_replies` is read in: the moment each
 * was asked, its seconds and its hold, whole. Null where the answer carries none (an older function, a longer window), and a row
 * that is not one is left out rather than counted as a reply nobody waited for.
 */
function repliesOf(answered: unknown): RecentReplies | null {
  if (!Array.isArray(answered)) return null;
  return answered.flatMap((r: unknown) => {
    const row = r as { asked_at?: unknown; s?: unknown; hold?: unknown } | null;
    return row && typeof row.asked_at === "string" && typeof row.s === "number" && Number.isFinite(row.s)
      ? [
          {
            asked_at: row.asked_at,
            s: row.s,
            hold: typeof row.hold === "number" && Number.isFinite(row.hold) ? row.hold : 0,
          },
        ]
      : [];
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
  // plpgsql aggregates on Today's wall clock.
  const [res, email] = await Promise.all([
    supabase.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: days }),
    // A mailbox that cannot be read is a line that cannot be counted, which is
    // its own state (callsRead is the same shape), never a blank Today and
    // never a count that is short by one.
    emailLineFor(supabase, tenantId).catch((e: unknown) => {
      log.error("today_email_line_read_failed", { error: e });
      return null;
    }),
  ]);
  if (res.error) throw new Error(res.error.message);
  // The function's answer, less the day's replies it carries for this server alone (00359): they are counted here and
  // never sent on, so the page's payload is the one it always took.
  const { replies: carried, ...summary } = (res.data ?? {}) as unknown as MetricsSummaryDto & { replies?: unknown };
  const answered: MetricsSummaryDto | null = res.data ? summary : null;
  if (!answered || (answered as unknown as { error?: string }).error) return null;
  // A day's replies are the function's own rows where it answers them. Asked of first_replies only where it does not (a
  // dashboard deployed before its migration: either order works), and then after the function, which is the wait every
  // read of Today had beside it.
  const recent =
    days !== REPLIES_WINDOW_DAYS ? null : (repliesOf(carried) ?? (await recentReplies(supabase, tenantId)));
  const hold = recent === null ? undefined : holdSummary(recent, answered.window.since);
  const dto = hold === undefined ? answered : { ...answered, reply_hold: hold };
  if (email === null) return { ...dto, linesRead: false };
  const wires = emailWires(email);
  // Untouched where there is no email line: a deployment without the channel
  // gets exactly the payload the function answered.
  return wires.length ? { ...dto, channels: [...(dto.channels ?? []), ...wires] } : dto;
}
