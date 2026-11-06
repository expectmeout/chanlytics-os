/**
 * What was booked today, which Today's figures lead with (decision 0076, as amended 2 Nov 2026: the figures were activity,
 * and a receptionist's day is measured by what it booked). Counted by the bell's own rule, so the figure and the bell's
 * "Someone booked with you" never disagree: each change of a visit since the day began that is a booking arriving
 * (contracts bookingArriving: a visit added or confirmed by the owner's calendar, a booking tool or its email, never the
 * owner's own entry or a calendar's first read), each still booked (db bookedVisitsOf, which names nobody erased), each
 * once (contracts bookedOnce: a booking and the calendar's copy of it are one visit).
 *
 * The changes are read beside metrics_summary, over the last 26 hours, since the day's own midnight is only known once the
 * function has answered; the visits after it, and only on a day something arrived.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOUR_MS,
  TODAY_BOOKED_SHOWN,
  bookedOnce,
  bookingArriving,
  type BookedVisit,
  type TodayBookedDto,
  type TodayBookingsDto,
} from "@chanlytics/contracts";
import { bookedVisitsOf, bookingsCanArrive, visitChangesSince, type Database } from "@chanlytics/db";
import { log } from "@/server/shared/log";

type Db = SupabaseClient<Database>;

/** How far back the changes are read: a local day is at most 25 hours long, so 26 always holds its midnight. */
const CHANGES_LOOKBACK_MS = 26 * HOUR_MS;

/** What is read beside the function: the visits' changes of the last 26 hours, and whether a booking can arrive here. */
interface BookingsLately {
  changes: Awaited<ReturnType<typeof visitChangesSince>>;
  arrive: boolean;
}

/** The reads beside the function; null where either failed (logged), and the figures are then the four they were. */
export function bookingsLately(supabase: Db, tenantId: string, nowMs = Date.now()): Promise<BookingsLately | null> {
  return Promise.all([
    visitChangesSince(supabase, tenantId, new Date(nowMs - CHANGES_LOOKBACK_MS).toISOString()),
    bookingsCanArrive(supabase, tenantId),
  ]).then(
    ([changes, arrive]) => ({ changes, arrive }),
    (e: unknown) => {
      log.error("today_bookings_read_failed", { tenant_id: tenantId, error: e });
      return null;
    },
  );
}

/** One visit as the answer carries it. */
const bookedDtoOf = (v: BookedVisit): TodayBookedDto => ({
  id: v.id,
  start: v.start,
  end: v.end,
  all_day: v.allDay,
  timezone: v.timezone,
  who: v.who,
  service: v.service,
});

/**
 * What was booked since the window began (`since`, the function's own midnight): the bookings that arrived, as they stand
 * now, each once, the soonest first. Null where the visits could not be read (logged).
 */
export async function bookedSince(
  supabase: Db,
  tenantId: string,
  lately: BookingsLately,
  since: string,
): Promise<TodayBookingsDto | null> {
  const from = Date.parse(since);
  const ids = [
    ...new Set(
      lately.changes.flatMap((e) => {
        if (Date.parse(e.created_at) < from) return [];
        const arrived = bookingArriving(e);
        return arrived ? [arrived.appointmentId] : [];
      }),
    ),
  ];
  if (!ids.length) return { booked: 0, visits: [], arrive: lately.arrive };
  try {
    // Still ahead of the window's own start: a visit booked today for later today counts once its hour has passed.
    const visits = bookedOnce(await bookedVisitsOf(supabase, tenantId, ids, from));
    return {
      booked: visits.length,
      visits: visits.slice(0, TODAY_BOOKED_SHOWN).map(bookedDtoOf),
      arrive: lately.arrive || visits.length > 0,
    };
  } catch (e) {
    log.error("today_bookings_read_failed", { tenant_id: tenantId, error: e });
    return null;
  }
}
