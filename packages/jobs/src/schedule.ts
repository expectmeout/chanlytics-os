/**
 * Scheduling is one insert. The heartbeat (api/jobs/tick.ts, over
 * claim_due_jobs) runs whatever is due, so there is no second system to tell,
 * no publish that can be lost after the row is written, and no orphan to clean
 * up. Service-role territory (§8): never called with a session client.
 */
import type { Json } from "@chanlytics/db";
import type { JobKind } from "@chanlytics/contracts";
import type { Db } from "./ledger";

export interface ScheduleParams {
  tenantId: string;
  kind: JobKind;
  dueAt: Date;
  payload: Json;
}

export async function scheduleJob(db: Db, p: ScheduleParams): Promise<{ jobId: string }> {
  const { data, error } = await db
    .from("jobs")
    .insert({ tenant_id: p.tenantId, kind: p.kind, due_at: p.dueAt.toISOString(), payload: p.payload })
    .select("id")
    .single();
  if (error || !data) throw new Error(`schedule_job: ${error?.message ?? "no row"}`);
  return { jobId: data.id };
}

/**
 * The same insert, for a kind the ledger holds at most one of per subject (a
 * unique index on its payload: email_ingest, 00127). A second insert for the
 * same subject is the provider delivering its webhook again, and is answered
 * as the fact it is rather than thrown: the work is already on the ledger.
 */
export async function scheduleJobOnce(db: Db, p: ScheduleParams): Promise<"scheduled" | "already_scheduled"> {
  const { error } = await db
    .from("jobs")
    .insert({ tenant_id: p.tenantId, kind: p.kind, due_at: p.dueAt.toISOString(), payload: p.payload });
  if (!error) return "scheduled";
  if (error.code === "23505") return "already_scheduled";
  throw new Error(`schedule_job: ${error.message}`);
}

/**
 * Withdraw every scheduled job of a kind for one subject, in one statement.
 * A job already claimed is past withdrawing; from there the handler's own
 * checks are the guard (an outbound_send re-reads its message, and a canceled
 * message is not sent).
 */
export async function cancelJobsFor(
  db: Db,
  tenantId: string,
  kind: JobKind,
  payloadKey: string,
  payloadValue: string,
): Promise<number> {
  // The key is concatenated into a PostgREST filter column, so it is held to a
  // plain JSON key: a metacharacter in it (a comma, a dot, a bracket) would
  // become a different filter — or an extra one — and widen the rows this
  // cancels, rather than failing.
  if (!/^[a-z][a-z0-9_]*$/.test(payloadKey)) throw new Error(`cancel_jobs_for: ${payloadKey} is not a payload key`);
  const { data, error } = await db
    .from("jobs")
    .update({ state: "canceled" })
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("state", "scheduled")
    .eq(`payload->>${payloadKey}`, payloadValue)
    .select("id");
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "cancel_jobs_failed", tenant_id: tenantId, kind, error: error.message }));
    return 0;
  }
  return data?.length ?? 0;
}
