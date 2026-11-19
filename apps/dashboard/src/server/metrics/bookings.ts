/**
 * What was booked today, which Today's figures lead with (decision 0076, as amended 2 Nov 2026: the figures were activity,
 * and a receptionist's day is measured by what it booked). Counted by the bell's own rule, so the figure and the bell's
 * "Someone booked with you" never disagree: each change of a visit since the day began that is a booking arriving
 * (contracts bookingArriving: a visit added or confirmed by the owner's calendar, a booking tool or its email, never the
 * owner's own entry or a calendar's first read), each still booked (db listBookedVisits, which names nobody erased), each
 * once (contracts bookedOnce: a booking and the calendar's copy of it are one visit).
 *
 * The changes are read beside metrics_summary, over the last 26 hours, since the day's own midnight is only known once the
 * function has answered; the visits after it, and only on a day something arrived.
 *
 * The days before today are counted by the same rule (bookedOfDay), from the moment each booking arrived as its visit
 * keeps it (decision 0141, appointments.arrived_at: the bell's rule stamps it as the event is delivered), so a week of
 * bookings is one read of what arrived and no second copy of what a booking is (findBookedDays, for Reports' headline).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOUR_MS,
  TODAY_BOOKED_SHOWN,
  bookedOnce,
  bookingArriving,
  shiftKey,
  zoneDayKey,
  zoneMidnight,
  type BookedVisit,
  type TodayBookedDto,
  type TodayBookingsDto,
} from "@chanlytics/contracts";
import { listArrivedVisits, listBookedVisits } from "@chanlytics/db/notices";
import { canBookingsArrive, findVisitChangesSince } from "@chanlytics/db/calendar";
import type { Database } from "@chanlytics/db/types";
import { log } from "@/server/shared/log";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** How far back the changes are read: a local day is at most 25 hours long, so 26 always holds its midnight. */
const CHANGES_LOOKBACK_MS = 26 * HOUR_MS;

/** What is read beside the function: the visits' changes of the last 26 hours, and whether a booking can arrive here. */
interface BookingsLately {
  changes: Awaited<ReturnType<typeof findVisitChangesSince>>;
  arrive: boolean;
}

/** The reads beside the function; null where either failed (logged), and the figures are then the four they were. */
export function findBookingsLately(
  supabase: Db,
  tenantId: TenantId,
  nowMs = Date.now(),
): Promise<BookingsLately | null> {
  return Promise.all([
    findVisitChangesSince(supabase, tenantId, new Date(nowMs - CHANGES_LOOKBACK_MS).toISOString()),
    canBookingsArrive(supabase, tenantId),
  ]).then(
    ([changes, arrive]) => ({ changes, arrive }),
    (e: unknown) => {
      log.error("today_bookings_read_failed", { tenant_id: tenantId, error: e });
      return null;
    },
  );
}

/** The days of bookings the headline carries at most: the week Today draws beside the figure (decision 0141). */
export const BOOKED_DAYS = 7;

/**
 * A day's bookings, the one rule (decision 0141): of the visits that arrived that day and are not taken back (db MADE:
 * booked still, or since said kept or missed), those that start after the day began, each once (contracts bookedOnce: a
 * booking and the calendar's copy of it are one visit). Today's figure and every day of the week ask it, so a column of
 * the week says what the figure said that day, less what was cancelled since.
 */
function bookedOfDay<Visit extends BookedVisit>(visits: readonly Visit[], dayStartMs: number): BookedVisit[] {
  return bookedOnce(visits.filter((visit) => Date.parse(visit.start) > dayStartMs));
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
export async function findBookedSince(
  supabase: Db,
  tenantId: TenantId,
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
    // Still ahead of the window's own start: a visit booked today for later today counts once its hour has passed, and
    // once a member has said they came (made, not booked alone: decision 0141).
    const visits = bookedOfDay(await listBookedVisits(supabase, tenantId, ids, from, "made"), from);
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

/**
 * What was booked on each of the last `days` days in the workspace's `zone`, oldest first and today (at `nowMs`) last
 * (decision 0141): the visits that arrived since the first of those days began (db listArrivedVisits, by the stamp the
 * bell's rule writes), each on the day it arrived, counted by the day's own rule. Null where they could not be read
 * (logged), and on a database that keeps no arrival yet (00647 is applied after the build), which the log says once a
 * read: the headline then carries no bookings and Today draws no week of them.
 */
export async function findBookedDays(
  supabase: Db,
  tenantId: TenantId,
  { zone, nowMs, days }: { zone: string; nowMs: number; days: number },
): Promise<number[] | null> {
  const today = zoneDayKey(nowMs, zone);
  const keys = Array.from({ length: days }, (_, at) => shiftKey(today, at - (days - 1)));
  const first = keys.at(0);
  if (!first) return [];
  try {
    const arrived = await listArrivedVisits(supabase, tenantId, new Date(zoneMidnight(zone, first)).toISOString());
    if (arrived === null) {
      log.warn("booked_days_missing", { tenant_id: tenantId });
      return null;
    }
    const dayOf = (iso: string) => zoneDayKey(Date.parse(iso), zone);
    return keys.map(
      (key) =>
        bookedOfDay(
          arrived.filter((visit) => dayOf(visit.arrivedAt) === key),
          zoneMidnight(zone, key),
        ).length,
    );
  } catch (e) {
    log.error("today_bookings_read_failed", { tenant_id: tenantId, error: e });
    return null;
  }
}
