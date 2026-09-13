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
import type { Database } from "./workspace/db.js";

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

export interface DuePage<T> {
  /** This tick's work, oldest first. */
  rows: T[];
  /** How many more were waiting behind them. 0 means the queue drained. */
  remaining: number;
}

/**
 * The workspaces whose calendar is due, never-read first.
 *
 * `minAgeMs` keeps a tenant from being read twice in one hour when the cap is
 * larger than the queue: without it a small deployment would re-read the same
 * three feeds every tick and burn the provider's rate limit on nothing.
 *
 * ROWS WITH A FEED ONLY, which is not a refinement — it is what makes the
 * rotation a rotation. Every workspace gets a `tenant_config` row at signup
 * and most never connect a calendar; those rows have no `calendar_checked_at`
 * and never get one (the sweep stamps on a successful READ, and there is
 * nothing to read), so they sort first under NULLS FIRST for ever. At forty of
 * them the page is entirely feedless every hour: no calendar is ever read
 * again, and `remaining` never reaches zero, so the sweep also reports a
 * permanent backlog, turns itself red and pages the platform about work that
 * does not exist. 00089 built an index for this query `where config ?
 * 'calendar'` and said so in its comment; the query never asked, and still
 * does not — Postgres cannot derive `config ? 'calendar'` from `config->>
 * 'calendar' is not null`, so the index stays unused and the tick is a scan
 * and a sort of tenant_config. That is throughput, not correctness, and at
 * the size where it matters the index predicate should be changed to match
 * rather than the filter changed to match the index: `?` would also select a
 * key explicitly set to JSON null, which is not a feed.
 *
 * Spelled `->>`, the text form, which is what every other jsonb filter in this
 * codebase uses against the real PostgREST (the jobs ledger's
 * `payload->>contact_id`, the recording sweep's `recording->>fetch_state`). A
 * key that is absent reads as SQL NULL either way; the text form also excludes
 * a key explicitly set to JSON null, which has no feed either.
 */
export async function calendarDue(db: Db, now: Date, limit: number, minAgeMs = 55 * 60_000): Promise<DuePage<{ tenant_id: string; config: unknown }>> {
  const before = new Date(now.getTime() - minAgeMs).toISOString();
  const due = `calendar_checked_at.is.null,calendar_checked_at.lt.${before}`;
  const { data, error, count } = await db
    .from("tenant_config")
    .select("tenant_id, config", { count: "exact" })
    .not("config->>calendar", "is", null)
    .or(due)
    .order("calendar_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`reading the calendars due: ${error.message}`);
  const rows = data ?? [];
  return { rows, remaining: Math.max(0, (count ?? rows.length) - rows.length) };
}

/** Stamp a workspace as read. Only ever on SUCCESS: a failure leaves it due, which self-heals next tick. */
export async function markCalendarChecked(db: Db, tenantId: string, now: Date): Promise<void> {
  const { error } = await db.from("tenant_config").update({ calendar_checked_at: now.toISOString() }).eq("tenant_id", tenantId);
  if (error) throw new Error(`stamping the calendar read: ${error.message}`);
}

/**
 * The running playbooks due, least-recently-run first.
 *
 * Ordered on `last_run_at`, which this table has carried since 00048 — so
 * unlike the calendar this needed no new column, only the ordering and the cap
 * it never had.
 */
export async function playbooksDue(db: Db, limit: number): Promise<DuePage<Database["public"]["Tables"]["playbooks"]["Row"]>> {
  const { data, error, count } = await db
    .from("playbooks")
    .select("*", { count: "exact" })
    .eq("state", "running")
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`reading the playbooks due: ${error.message}`);
  const rows = data ?? [];
  return { rows, remaining: Math.max(0, (count ?? rows.length) - rows.length) };
}

/**
 * Record whether this tick left work behind, and say whether that has now been
 * true often enough to be a fault rather than a busy hour.
 *
 * Never throws: a sweep that did its work must not report failure because its
 * own bookkeeping could not be written.
 */
export async function noteBacklog(db: Db, sweep: string, remaining: number): Promise<{ ticks: number; alarm: boolean }> {
  const { data, error } = await db.rpc("note_sweep_backlog", { p_sweep: sweep, p_remaining: remaining });
  if (error) return { ticks: 0, alarm: false };
  const ticks = typeof data === "number" ? data : 0;
  return { ticks, alarm: ticks >= BACKLOG_TICKS_BEFORE_ALARM };
}
