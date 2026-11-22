/**
 * The business's history as Today says it (Working for you, W9 and W15; contracts ask/memory/morning.ts): how many visits AI
 * has booked, all of them and those of the last days, and how many visits each of the last four of today's weekday held
 * by this hour. Six counts the database makes, none of a row, read beside AI's morning once a visit to Today
 * (ask/companion/morning.ts) and never with the day's own read, which is asked again as a conversation moves.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAY_MS,
  WEEK_MS,
  shiftKey,
  zoneDayKey,
  zoneMidnight,
  type AskMorningDto,
  type TenantId,
} from "@chanlytics/contracts";
import { countBookedByAi, countVisitsKnownBy } from "@chanlytics/db/calendar";
import type { Database } from "@chanlytics/db/types";
import { log } from "@/server/shared/log";

type Db = SupabaseClient<Database>;
/** The history as the morning's read carries it. */
type TodayHistory = NonNullable<AskMorningDto["history"]>;

/** The days a milestone stays worth saying: AI's bookings reached it within them. The read says them (`days`). */
const LATELY_DAYS = 7;
/** The weeks before today a usual day of its weekday is taken from: four of the business's own, a count each. */
const USUAL_WEEKS = 4;

/**
 * Today's weekday `weeks` weeks ago in the workspace's zone, as far into it as today is now: where the day began and
 * ended, and the hour of it that matches this one.
 */
function weekdayBefore(
  zone: string,
  nowMs: number,
  weeks: number,
): { fromIso: string; toIso: string; knownByIso: string } {
  const today = zoneDayKey(nowMs, zone);
  const key = shiftKey(today, (-weeks * WEEK_MS) / DAY_MS);
  const from = zoneMidnight(zone, key);
  const into = nowMs - zoneMidnight(zone, today);
  return {
    fromIso: new Date(from).toISOString(),
    toIso: new Date(zoneMidnight(zone, shiftKey(key, 1))).toISOString(),
    knownByIso: new Date(from + into).toISOString(),
  };
}

/**
 * The history at `nowMs`, in the workspace's `zone`. Null where any count could not be read (logged): Today then says no
 * milestone and no word for the day, as before there was a history to read.
 */
export async function findTodayHistory(
  supabase: Db,
  tenantId: TenantId,
  { zone, nowMs }: { zone: string; nowMs: number },
): Promise<TodayHistory | null> {
  const lately = new Date(nowMs - LATELY_DAYS * DAY_MS).toISOString();
  const weeks = Array.from({ length: USUAL_WEEKS }, (_, at) => at + 1);
  try {
    const [total, booked, ...visits] = await Promise.all([
      countBookedByAi(supabase, tenantId, null),
      countBookedByAi(supabase, tenantId, lately),
      ...weeks.map((back) => countVisitsKnownBy(supabase, tenantId, weekdayBefore(zone, nowMs, back))),
    ]);
    return { booked_by_ai: { total, lately: booked, days: LATELY_DAYS }, weekday_visits: visits };
  } catch (e) {
    log.error("today_bookings_read_failed", { tenant_id: tenantId, error: e, what: "history" });
    return null;
  }
}
