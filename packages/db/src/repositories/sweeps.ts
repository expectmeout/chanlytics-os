/**
 * What the hourly sweeps read (00193): a bounded page of what is due, judged in the database, with the exact count of
 * what is due beyond it. The playbooks sweep used to read a page of every running playbook and judge due-ness after,
 * so a due playbook waited behind a page of ones that had run today or were hours from their hour, and what it said
 * it could not reach counted those too: a deployment with twenty-six daily playbooks called itself backlogged every
 * hour of the day. The service role asks these (the edge's sweeps); a read that fails throws, so a database without
 * the function is a sweep that says so, never a quiet tick.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAYBOOK_HOURS } from "@chanlytics/contracts";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;

/** A sweep's page: this tick's rows, the longest waiting first, and how many due rows were left beyond them. */
export interface DuePage<T> {
  rows: T[];
  /** Due rows beyond the page. 0 means the queue drained. */
  remaining: number;
}

/** What is left beyond a page whose every row carries the count of all that were due. An empty page left nothing. */
function remainingOf(rows: Array<{ due_total: unknown }>): number {
  if (rows.length === 0) return 0;
  const total = rows[0].due_total;
  if (typeof total !== "number") throw new Error("the database answered without its count of what is due");
  return Math.max(0, total - rows.length);
}

export interface DuePlaybook {
  /** The playbook as its row reads. */
  playbook: Database["public"]["Tables"]["playbooks"]["Row"];
  /** The zone it was judged due in: its workspace's own (tenants.timezone), the one its run keeps to. */
  timezone: string;
}

/**
 * The running playbooks of one kind due at `at` (00193 playbooks_due): at or past their hour by their workspace's own
 * clock, not past the last hour a message may go out, and not yet run for that clock's day -- runDueNow's rule, judged
 * in the database -- never run first, then the least recently run, `limit` of them, with the exact count of due
 * playbooks beyond the page. `tenantId` keeps to one workspace (a test's); the sweep asks for every workspace.
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
    rows: rows.map((r) => ({ playbook: r.playbook as unknown as DuePlaybook["playbook"], timezone: r.timezone })),
    remaining: remainingOf(rows),
  };
}

export interface DueCalendar {
  tenant_id: string;
  /** The workspace's configuration as stored; its calendar's address is in it. */
  config: Json;
  /** The zone its feed is read in: the workspace's own (tenants.timezone), UTC when that is a name nobody knows. */
  timezone: string;
}

/**
 * The workspaces whose calendar is due before `before` (00193 calendars_due): a feed's address on the row, never read
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
