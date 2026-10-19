/**
 * Campaigns over a span of the Calendar (the Calendar's lane C): the runs that fall in it and the campaigns' schedules,
 * as GET calendar/runs reads them for the board's marks (contracts calendar-runs.ts). Each read whole and in a stable
 * order (paged.ts): a select answers a thousand rows at most, silently. Reads only, on the member's client, where RLS
 * decides; a failed read throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS } from "@chanlytics/contracts";
import type { Database } from "../../database.types";
import { readAllRows } from "../../paged";

type Db = SupabaseClient<Database>;

/** A run as the span's marks read it: the batch's schedule, its state and whose it is. */
export type SpanRunRow = Pick<
  Database["public"]["Tables"]["sequence_batches"]["Row"],
  "id" | "name" | "state" | "scheduled_for" | "started_at" | "finished_at" | "run_for" | "audience" | "recipient_count"
> & {
  /** The step it is a run of (sequence_batches.step_id), under the name the Calendar's marks read; null for a one-off. */
  playbook_id: string | null;
};

const RUN_COLUMNS =
  "id, name, state, scheduled_for, started_at, finished_at, run_for, playbook_id:step_id, audience, recipient_count";

/** How far before the span a one-off send may have been scheduled and still sit in it (it sits where it finished). */
const SEND_LEAD_MS = 2 * DAY_MS;

/**
 * The runs that fall in a span: a campaign's runs by the business's day they ran for (`run_for`, from `fromDay` to
 * `toDay`), and the one-off sends scheduled from a little before the span to its end (a send sits where it finished,
 * else began, else was scheduled: the contracts' placement decides the day). Two reads, waited for together.
 */
export async function runsInSpan(
  db: Db,
  tenantId: string,
  span: { fromIso: string; toIso: string; fromDay: string; toDay: string },
): Promise<SpanRunRow[]> {
  const sendsFrom = new Date(Date.parse(span.fromIso) - SEND_LEAD_MS).toISOString();
  const [runs, sends] = await Promise.all([
    readAllRows<SpanRunRow>("calendar_runs_campaign", (from, to) =>
      db
        .from("sequence_batches")
        .select(RUN_COLUMNS)
        .eq("tenant_id", tenantId)
        .not("step_id", "is", null)
        .gte("run_for", span.fromDay)
        .lte("run_for", span.toDay)
        .order("run_for", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAllRows<SpanRunRow>("calendar_runs_send", (from, to) =>
      db
        .from("sequence_batches")
        .select(RUN_COLUMNS)
        .eq("tenant_id", tenantId)
        .is("step_id", null)
        .gte("scheduled_for", sendsFrom)
        .lt("scheduled_for", span.toIso)
        .order("scheduled_for", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  return [...runs, ...sends];
}

/**
 * A campaign's schedule: what its next run and its last day are worked out from, its sequence (whose mode decides its
 * batches, decision 0064) and when its words were last let go.
 */
export type MomentScheduleRow = Pick<
  Database["public"]["Tables"]["sequence_steps"]["Row"],
  "id" | "sequence_id" | "name" | "trigger" | "state" | "run_hour" | "last_run_for" | "until" | "words_ok_at"
>;

/** Every campaign's schedule columns, and nothing more: the board forecasts from these alone. */
export async function momentSchedules(db: Db, tenantId: string): Promise<MomentScheduleRow[]> {
  return readAllRows<MomentScheduleRow>("calendar_moment_schedules", (from, to) =>
    db
      .from("sequence_steps")
      .select("id, sequence_id, name, trigger, state, run_hour, last_run_for, until, words_ok_at")
      .eq("tenant_id", tenantId)
      .order("id", { ascending: true })
      .range(from, to),
  );
}
