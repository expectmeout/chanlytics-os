/**
 * The business's history as Today says it (Working for you, W9 and W15; contracts ask/memory/morning.ts): how many visits AI
 * has booked, all of them and those of the last days, and how many visits each of the last four of today's weekday held
 * by this hour. Counts the database makes, none of a row, read beside AI's morning (ask/companion/morning.ts) and never
 * with the day's own read, which is asked again as a conversation moves.
 *
 * The morning is read as Today opens, again every few minutes while it stays open, and as a campaign's sends move
 * (surfaces/today/ask-morning-surface.ts), and the count of all of AI's bookings walks every one a business has had. So
 * AI's two counts are kept an hour on this instance, per workspace (`AI_BOOKED_KEPT_MS`): a milestone is news for a week,
 * and an hour late to it says the same. The four weekday counts are each one short walk of a day's visits by their start
 * (appointments_tenant_start), read every time, since what "by this hour" holds moves with the hour.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAY_MS,
  HOUR_MS,
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

/** How long AI's two counts are kept on this instance for a workspace before they are counted again. */
const AI_BOOKED_KEPT_MS = HOUR_MS;
/** The workspaces whose counts this instance keeps at most: past it, the one counted longest ago goes. */
const AI_BOOKED_KEPT_CAP = 1000;

/** AI's bookings as the read carries them. */
type AiBooked = TodayHistory["booked_by_ai"];

/**
 * AI's counts per workspace, as this instance last made them: when, and the counting itself, which every read in the
 * meantime shares. A count that failed is not kept, so the next read counts again.
 */
const aiBookedKept = new Map<TenantId, { at: number; counted: Promise<AiBooked> }>();

/** AI's bookings for a workspace at `nowMs`: kept from an hour or less ago, else counted now. */
function countAiBooked(supabase: Db, tenantId: TenantId, nowMs: number): Promise<AiBooked> {
  const had = aiBookedKept.get(tenantId);
  if (had && nowMs - had.at >= 0 && nowMs - had.at < AI_BOOKED_KEPT_MS) return had.counted;
  const lately = new Date(nowMs - LATELY_DAYS * DAY_MS).toISOString();
  const counted = Promise.all([
    countBookedByAi(supabase, tenantId, null),
    countBookedByAi(supabase, tenantId, lately),
  ]).then(([total, booked]) => ({ total, lately: booked, days: LATELY_DAYS }));
  // Deleted first, so a new count goes to the back: Map.set keeps a key it holds where it was.
  aiBookedKept.delete(tenantId);
  aiBookedKept.set(tenantId, { at: nowMs, counted });
  counted.catch(() => {
    if (aiBookedKept.get(tenantId)?.counted === counted) aiBookedKept.delete(tenantId);
  });
  const oldest = aiBookedKept.keys().next();
  if (aiBookedKept.size > AI_BOOKED_KEPT_CAP && !oldest.done) aiBookedKept.delete(oldest.value);
  return counted;
}

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
  const weeks = Array.from({ length: USUAL_WEEKS }, (_, at) => at + 1);
  try {
    const [booked, visits] = await Promise.all([
      countAiBooked(supabase, tenantId, nowMs),
      Promise.all(weeks.map((back) => countVisitsKnownBy(supabase, tenantId, weekdayBefore(zone, nowMs, back)))),
    ]);
    return { booked_by_ai: booked, weekday_visits: visits };
  } catch (e) {
    log.error("today_bookings_read_failed", { tenant_id: tenantId, error: e, what: "history" });
    return null;
  }
}
