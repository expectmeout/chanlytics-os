/**
 * The numbers behind Today, and the wires they are counted on.
 *
 * `metrics_summary` answers the routing rows. A workspace's email line is its
 * mailbox and this deployment's mail domain, which the database cannot see,
 * so it is added here, from `getEmailLine`, the judgement Setup and
 * Connections make with the rest of what they say of email. For a one-day window the hold the day's replies waited is added too
 * (`reply_hold`: the one rule's count of the replies that went out as the hold ended, later, and with none), because the function
 * answers the median and the median of a held reply is the hold. The replies are the function's own (`replies`, 00359: the rows it
 * read to count who answered), where it answers them; a database the migration has not reached is asked `first_replies` for them
 * after it, as every read of Today was asked beside it. What was booked that day is counted beside the function too (bookings.ts),
 * which the day's figures lead with. Both readers of the function come through this one door, so the page's Today and Ask's
 * Today count the same lines, say the same speed and the same bookings.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOUR_MS,
  emailWires,
  holdOf,
  replyHoldDtoOf,
  type MetricsSummaryDto,
  recordOrNull,
  shaped,
  valueAt,
} from "@chanlytics/contracts";
import { listFirstReplies, readMetricsSummary } from "@chanlytics/db/reports";
import { readAnswer } from "@chanlytics/db/shared";
import type { Database } from "@chanlytics/db/types";
import { getEmailLine } from "../connections/email";
import { findBookedSince, findBookingsLately } from "./bookings";
import { log } from "@/server/shared/log";

/** The window the day's replies are read over: Today's one day. A longer window carries none (a period's replies are Reports', report_series). */
const REPLIES_WINDOW_DAYS = 1;

/**
 * How far back the day's replies are read: a local day is at most 25 hours long (a clock put back), so 26 always holds the window's
 * own midnight, which is only known once the function has answered, and the read cannot wait for it.
 */
const REPLIES_LOOKBACK_MS = 26 * HOUR_MS;

type RecentReplies = Awaited<ReturnType<typeof listFirstReplies>>;

/**
 * The receptionist's replies of the last 26 hours with the hold each waited, asked of `first_replies` itself: only where the
 * function's answer carried none (a database before 00359). Null when the read failed (logged): the sentence then says the
 * median, as it did.
 */
function recentReplies(supabase: SupabaseClient<Database>, tenantId: string): Promise<RecentReplies | null> {
  return listFirstReplies(supabase, tenantId, new Date(Date.now() - REPLIES_LOOKBACK_MS)).catch((e: unknown) => {
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
  return answered.flatMap((response: unknown) => {
    const row = recordOrNull(response);
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
export async function findMetricsSummary(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  days: number,
): Promise<MetricsSummaryDto | null> {
  // Together, not waterfalled: one indexed row must not sit behind three
  // plpgsql aggregates on Today's wall clock.
  const day = days === REPLIES_WINDOW_DAYS;
  const [res, email, lately] = await Promise.all([
    readMetricsSummary(supabase, tenantId, days),
    // A mailbox that cannot be read is a line that cannot be counted, which is
    // its own state (callsRead is the same shape), never a blank Today and
    // never a count that is short by one.
    getEmailLine(supabase, tenantId).catch((e: unknown) => {
      log.error("today_email_line_read_failed", { error: e });
      return null;
    }),
    // What was booked today, which the day's figures lead with (bookings.ts): a longer window carries none.
    day ? findBookingsLately(supabase, tenantId) : Promise.resolve(undefined),
  ]);
  if (res.error) throw new Error(res.error.message);
  // The function's answer, less the day's replies it carries for this server alone (00359): they are counted here and
  // never sent on, so the page's payload is the one it always took.
  const { replies: carried, ...summary } = readAnswer(
    "readMetricsSummary",
    shaped<MetricsSummaryDto & { replies?: unknown }>(),
    res.data ?? {},
  );
  const answered: MetricsSummaryDto | null = res.data ? summary : null;
  if (!answered || valueAt(answered, "error")) return null;
  // A day's replies are the function's own rows where it answers them. Asked of first_replies only where it does not (a
  // dashboard deployed before its migration: either order works), and then after the function, which is the wait every
  // read of Today had beside it.
  // The day's midnight, as the function says it: an answer that names none is not the day's, and carries no bookings.
  const since = answered.window?.since;
  const [recent, bookings] = await Promise.all([
    !day ? null : (repliesOf(carried) ?? recentReplies(supabase, tenantId)),
    lately === undefined || !since ? undefined : lately && findBookedSince(supabase, tenantId, lately, since),
  ]);
  const hold = recent === null ? undefined : holdSummary(recent, answered.window.since);
  const held = hold === undefined ? answered : { ...answered, reply_hold: hold };
  const dto = bookings === undefined ? held : { ...held, bookings };
  if (email === null) return { ...dto, linesRead: false };
  const wires = emailWires(email);
  // Untouched where there is no email line: a deployment without the channel
  // gets exactly the payload the function answered.
  return wires.length ? { ...dto, channels: [...(dto.channels ?? []), ...wires] } : dto;
}
