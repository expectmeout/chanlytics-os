/**
 * What the hourly sweeps read to find their work, and the one stamp they write to keep it moving (00245). The database
 * judges what is due; each read answers a bounded page of it, the longest waiting first, with the exact count of what
 * is due beyond the page (`remaining`), so what a sweep says it could not reach never counts a row that was not due.
 * Judging in the database is what keeps a due row from waiting behind rows that are not, and one paused workspace's
 * playbooks from holding the page for every workspace.
 *   duePlaybooks         the running playbooks of one kind (moment or reach_out) due at a moment by their
 *                        workspace's own clock (playbooks_due), each with the zone it was judged in. A paused
 *                        workspace's are not due.
 *   dueCalendars         the workspaces whose calendar feed was never read, or not since a moment (calendars_due),
 *                        each with its zone. A row whose calendar has no address is not a feed and is never due.
 *   stampPlaybooksTried  a due moment that could not run this tick is stamped last_run_at with its day left open,
 *                        which sorts it behind the moments that can run, so it never holds the page's first places.
 * The functions are the service role's alone. The edge's calendar and playbooks sweeps read the pages through
 * lib/ops/sweep-rotation.ts, and the playbooks sweep calls the stamp. A read that fails throws, and so does a page
 * whose rows lack the count, so a database without the function is a sweep that says so, never a quiet tick.
 *
 * Cross-workspace: the hourly sweeps page what is due across every workspace; each row carries its tenant_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAYBOOK_HOURS } from "@chanlytics/contracts";
import type { Database, Json } from "./database.types";

type Db = SupabaseClient<Database>;

/** A sweep's page: this tick's rows, the longest waiting first, and how many due rows were left beyond them. */
export interface DuePage<T> {
  rows: T[];
  /** Due rows beyond the page. 0 means the queue drained. */
  remaining: number;
}

/** What is left beyond a page whose every row carries the count of all that were due. An empty page left nothing. */
function remainingOf(rows: Array<{ due_total: unknown }>): number {
  const first = rows[0];
  if (first === undefined) return 0;
  const total = first.due_total;
  if (typeof total !== "number") throw new Error("the database answered without its count of what is due");
  return Math.max(0, total - rows.length);
}

type PlaybookRow = Database["public"]["Tables"]["playbooks"]["Row"];

export interface DuePlaybook {
  /** The playbook as its row reads. */
  playbook: PlaybookRow;
  /** The zone it was judged due in: its workspace's own (tenants.timezone), the one its run keeps to. */
  timezone: string;
}

/**
 * The running playbooks of one kind due at `at` (00245 playbooks_due): at or past their hour by their workspace's own
 * clock, not past the last hour a message may go out, and not yet run for that clock's day -- runDueNow's rule, judged
 * in the database -- never run first, then the least recently run, `limit` of them, with the exact count of due
 * playbooks beyond the page. A paused workspace's are not due: they run the hour after it resumes, their day still
 * open. `tenantId` keeps to one workspace (a test's); the sweep asks for every workspace.
 */
export async function duePlaybooks(
  db: Db,
  p: { kind: "moment" | "reach_out"; at: Date; limit: number; tenantId?: string },
): Promise<DuePage<DuePlaybook>> {
  const { data, error } = await db.rpc("playbooks_due", {
    p_kind: p.kind,
    p_at: p.at.toISOString(),
    p_last_hour: PLAYBOOK_HOURS.max,
    p_limit: p.limit,
    ...(p.tenantId ? { p_tenant_id: p.tenantId } : {}),
  });
  if (error) throw new Error(`cannot read the playbooks due: ${error.message}`);
  const rows = (data ?? []) as Array<{ playbook: Json; timezone: string; due_total: number }>;
  return {
    // The row as to_jsonb wrote it: the table's own shape, every column a JSON value.
    rows: rows.map((r) => ({ playbook: r.playbook as PlaybookRow, timezone: r.timezone })),
    remaining: remainingOf(rows),
  };
}

/**
 * Due moments of one workspace that could not run this tick (its workspace paused since the page was read, its context
 * unreadable), moved to the back of the page: `last_run_at` stamped, the day (`last_run_for`) left open, so the next
 * hour tries them again behind the moments that can run. A page is at most a sweep's cap of ids, so they ride in one
 * statement. Throws when the write fails.
 */
export async function stampPlaybooksTried(db: Db, tenantId: string, p: { ids: string[]; at: Date }): Promise<void> {
  if (p.ids.length === 0) return;
  const { error } = await db
    .from("playbooks")
    .update({ last_run_at: p.at.toISOString() })
    .eq("tenant_id", tenantId)
    .in("id", p.ids);
  if (error) throw new Error(`cannot move the moments to the back of the page: ${error.message}`);
}

export interface DueCalendar {
  tenant_id: string;
  /** The workspace's configuration as stored; its calendar's address is in it. */
  config: Json;
  /** The zone its feed is read in: the workspace's own (tenants.timezone), UTC when that is a name nobody knows. */
  timezone: string;
}

/**
 * The workspaces whose calendar is due before `before` (00245 calendars_due): a feed's address on the row, never read
 * or last read before then; never read first, then the least recently read, `limit` of them, each with its zone, with
 * the exact count of due calendars beyond the page. A row whose `calendar` has no address is not a feed, and is neither.
 */
export async function dueCalendars(
  db: Db,
  p: { before: Date; limit: number; tenantId?: string },
): Promise<DuePage<DueCalendar>> {
  const { data, error } = await db.rpc("calendars_due", {
    p_before: p.before.toISOString(),
    p_limit: p.limit,
    ...(p.tenantId ? { p_tenant_id: p.tenantId } : {}),
  });
  if (error) throw new Error(`cannot read the calendars due: ${error.message}`);
  const rows = (data ?? []) as Array<{ tenant_id: string; config: Json; timezone: string; due_total: number }>;
  return {
    rows: rows.map((r) => ({ tenant_id: r.tenant_id, config: r.config, timezone: r.timezone })),
    remaining: remainingOf(rows),
  };
}
