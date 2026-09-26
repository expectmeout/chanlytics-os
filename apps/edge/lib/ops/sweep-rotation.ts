/**
 * Which tenants a sweep serves this tick.
 *
 * THE DEFECT THIS EXISTS FOR. The calendar and playbook sweeps read every row
 * and then did serial network work inside a sixty-second function. At four
 * tenants that is instant. At four hundred it runs out of tick part way through
 * — and because the order never changed, the same early tenants were served
 * every hour and the ones past the cut-off were NEVER served. No error, no
 * alert: a 200 having done a fraction of the job, and the workspaces at the end
 * of the list offering appointment times that were taken last week.
 *
 * The shape of the answer is not new. `google_listings` has a `checked_at` and
 * its sweep takes "never checked first, then the least recently checked,
 * capped" — so every listing is reached and none starves. This is that, for the
 * two sweeps that lacked it, in one place so the third one to need it does not
 * invent a third version.
 *
 * THE DEFECT AFTER THAT. A page of running playbooks, least-recently-run first,
 * is not a page of due ones: it held playbooks that had run today and ones
 * hours from their hour, a due one waited behind twenty-five of those, and the
 * count of what was left behind counted them too — so past twenty-five running
 * playbooks the sweep called itself backlogged every hour of the day. Since
 * 00193 the database judges due-ness (playbooks_due, calendars_due, through
 * packages/db), each page is only what is due, and `remaining` is exactly the
 * due rows beyond it.
 *
 * Two properties matter and both are tested against a real ordering:
 *
 *   FAIRNESS   over enough ticks every tenant is served, because the ones just
 *              served sort to the back.
 *   HONESTY    the sweep reports what it could not reach, and three consecutive
 *              ticks with a backlog answers 503 — the queue is growing faster
 *              than the sweep drains it, which is a capacity fact a person has
 *              to hear before a customer does.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dueCalendars,
  duePlaybooks,
  type Database,
  type DueCalendar,
  type DuePage,
  type DuePlaybook,
} from "../packages/db.js";

type Db = SupabaseClient<Database>;

/**
 * A feed fetch is about a second, so forty leaves comfortable headroom inside
 * the sixty-second function. Playbooks SEND, so their ceiling is lower: the
 * cost of a tick that runs long there is a message half-delivered, not a
 * calendar read again next hour.
 */
export const CALENDAR_PER_TICK = 40;
export const PLAYBOOKS_PER_TICK = 25;

/** Consecutive backlogged ticks before a sweep calls itself unhealthy. */
export const BACKLOG_TICKS_BEFORE_ALARM = 3;

export type { DueCalendar, DuePage, DuePlaybook };

/**
 * The workspaces whose calendar is due, never-read first (00193 calendars_due).
 *
 * `minAgeMs` keeps a tenant from being read twice in one hour when the cap is
 * larger than the queue: without it a small deployment would re-read the same
 * three feeds every tick and burn the provider's rate limit on nothing.
 *
 * ROWS WITH A FEED ADDRESS ONLY, which is not a refinement — it is what makes
 * the rotation a rotation. Every workspace gets a `tenant_config` row at
 * signup and most never connect a calendar; those rows have no
 * `calendar_checked_at` and never get one (the sweep stamps on a successful
 * READ, and there is nothing to read), so they would sort first under NULLS
 * FIRST for ever. At forty of them the page would be entirely feedless every
 * hour: no calendar read again, `remaining` never zero, and the sweep paging
 * the platform about work that does not exist. A `calendar` without an
 * address is the same row in a different coat, and is judged the same.
 */
export async function calendarDue(
  db: Db,
  now: Date,
  limit: number,
  minAgeMs = 55 * 60_000,
): Promise<DuePage<DueCalendar>> {
  return dueCalendars(db, { before: new Date(now.getTime() - minAgeMs), limit });
}

/** Stamp a workspace as read. Only ever on SUCCESS: a failure leaves it due, which self-heals next tick. */
export async function markCalendarChecked(db: Db, tenantId: string, now: Date): Promise<void> {
  const { error } = await db
    .from("tenant_config")
    .update({ calendar_checked_at: now.toISOString() })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`stamping the calendar read: ${error.message}`);
}

/**
 * The running moments due at `now`, by each workspace's own clock, least-recently-run first (00193 playbooks_due).
 * Each comes with the zone it was judged in, so the run keeps to the same clock.
 */
export async function playbooksDue(db: Db, now: Date, limit: number): Promise<DuePage<DuePlaybook>> {
  return duePlaybooks(db, { kind: "moment", at: now, limit });
}

/**
 * The reach-out steps (Part 3) due at `now`, a page of their own, judged and ordered as the moments are: each runs
 * through runReachOut, never the moments' run, and a workspace's moments never crowd its reach-outs out of a tick.
 */
export async function reachOutsDue(db: Db, now: Date, limit: number): Promise<DuePage<DuePlaybook>> {
  return duePlaybooks(db, { kind: "reach_out", at: now, limit });
}

/**
 * Record whether this tick left work behind, and say whether that has now been
 * true often enough to be a fault rather than a busy hour.
 *
 * Never throws: a sweep that did its work must not report failure because its
 * own bookkeeping could not be written.
 */
export async function noteBacklog(
  db: Db,
  sweep: string,
  remaining: number,
): Promise<{ ticks: number; alarm: boolean }> {
  const { data, error } = await db.rpc("note_sweep_backlog", { p_sweep: sweep, p_remaining: remaining });
  if (error) return { ticks: 0, alarm: false };
  const ticks = typeof data === "number" ? data : 0;
  return { ticks, alarm: ticks >= BACKLOG_TICKS_BEFORE_ALARM };
}
