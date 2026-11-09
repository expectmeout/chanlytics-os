/**
 * What is due, for the clock that hands it out and for the job that runs it (decision 0115).
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
 * 00245 the database judges due-ness (playbooks_due, calendars_due, through
 * packages/db), each page is only what is due, and `remaining` is exactly the
 * due rows beyond it.
 *
 * THE DEFECT AFTER THAT. A fair page is still a page: twenty-five moments an hour across every business is a ceiling no
 * rotation lifts, and the alarm only said so. Since 00569 a clock hands each workspace with work due a job, and a job reads
 * its own workspace's page here (tenantId): the ledger gives the work its turn, and the ledger's own alarm says when it
 * outruns the runner.
 *
 * One property is tested against a real ordering:
 *
 *   FAIRNESS   a job that cannot reach everything leaves what is left at the front of the
 *              next page, because the ones just served sort to the back.
 *
 * Cross-workspace without a tenantId; each due row carries its own tenant_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDueCalendars, getDuePlaybooks, type DueCalendar, type DuePage, type DueStep } from "@chanlytics/db/jobs";
import type { Database } from "@chanlytics/db/types";
import { patchConfigRow } from "@chanlytics/db/workspace";
import type { TenantId } from "@chanlytics/contracts";
import { DbFailure } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/**
 * How far apart a clock's jobs fall due (00569 jobs_hand_out, by a hash of the workspace, so the same one each time): nine
 * o'clock in a zone is not a thousand jobs in one second, and each is still inside the hour the clock asked in.
 */
export const HAND_OUT_SPREAD_SECONDS = 300;

/** How long a calendar rests between reads: the clock's hour, with room for its drift. */
export const CALENDAR_REST_MS = 55 * 60_000;

export type { DueStep };

/**
 * The workspaces whose calendar is due, never-read first (00245 calendars_due).
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
 * hour: no calendar read again, and a job handed out each hour for work that
 * does not exist. A `calendar` without an
 * address is the same row in a different coat, and is judged the same.
 */
export async function listCalendarsDue(
  db: Db,
  now: Date,
  limit: number,
  tenantId?: TenantId,
): Promise<DuePage<DueCalendar>> {
  return getDueCalendars(db, {
    before: new Date(now.getTime() - CALENDAR_REST_MS),
    limit,
    ...(tenantId ? { tenantId } : {}),
  });
}

/**
 * Stamp a workspace as read, a read that failed included (calendar/sweep.ts says why). `failedSince`, where given, is
 * written with it in the same update: the moment its reads began failing (00435), or null once one works. The sweep
 * gives it only on a change, and only where the database keeps the stamp (its page carried one).
 */
export async function markCalendarChecked(
  db: Db,
  tenantId: TenantId,
  now: Date,
  also: { failedSince?: Date | null } = {},
): Promise<void> {
  const failing = "failedSince" in also ? { calendar_failed_since: also.failedSince?.toISOString() ?? null } : {};
  const { error } = await patchConfigRow(db, tenantId, { calendar_checked_at: now.toISOString(), ...failing });
  if (error) throw new DbFailure(error, "stamping the calendar read");
}

/**
 * The running moments due at `now`, by each workspace's own clock, least-recently-run first (00245 playbooks_due).
 * Each comes with the zone it was judged in, so the run keeps to the same clock.
 */
export async function listPlaybooksDue(
  db: Db,
  now: Date,
  limit: number,
  tenantId?: TenantId,
): Promise<DuePage<DueStep>> {
  return getDuePlaybooks(db, { kind: "moment", at: now, limit, ...(tenantId ? { tenantId } : {}) });
}

/**
 * The reach-out steps (Part 3) due at `now`, a page of their own, judged and ordered as the moments are: each runs
 * through runReachOut, never the moments' run, and a workspace's moments never crowd its reach-outs out of a tick.
 */
export async function listReachOutsDue(
  db: Db,
  now: Date,
  limit: number,
  tenantId?: TenantId,
): Promise<DuePage<DueStep>> {
  return getDuePlaybooks(db, { kind: "reach_out", at: now, limit, ...(tenantId ? { tenantId } : {}) });
}
