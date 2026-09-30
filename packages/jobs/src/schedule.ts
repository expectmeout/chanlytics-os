/**
 * Scheduling is one insert. The heartbeat (api/jobs/tick.ts, over
 * claim_due_jobs) runs whatever is due, so there is no second system to tell,
 * no publish that can be lost after the row is written, and no orphan to clean
 * up. Service-role territory (§8): never called with a session client.
 */
import { readJobToRequeue, type Json } from "@chanlytics/db";
import { JOB_KINDS, type JobKind } from "@chanlytics/contracts";
import { SPEAKS_TO_A_PERSON, type Db } from "./ledger";

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
    console.error(
      JSON.stringify({ level: "error", event: "cancel_jobs_failed", tenant_id: tenantId, kind, error: error.message }),
    );
    return 0;
  }
  return data?.length ?? 0;
}

/** What a requeue came to (requeueFailedJob). */
export type Requeued =
  | { outcome: "requeued"; kind: string }
  | { outcome: "not_found" }
  | { outcome: "not_failed"; state: string }
  | { outcome: "speaks_to_a_person"; kind: string }
  | { outcome: "unknown_kind"; kind: string }
  | { outcome: "already_scheduled" };

/**
 * A failed job, run again: a fresh row of its kind and payload, due now, beside the failed one, which stays as the
 * record of what went wrong (kept 90 days, 00215). `failed` is final (jobs_guard), so the row is never moved back.
 * The back office's door, on the platform scope: `record` writes who asked, after the checks and before the row, and a
 * record that throws leaves nothing done. A kind that speaks to a person is never requeued: its failure may be a send
 * whose outcome nobody knows, and it goes again from its thread or its broadcast, where a person sees whether it left.
 * A kind the ledger holds once per subject answers `already_scheduled` when the subject is on the ledger again.
 */
export async function requeueFailedJob(
  db: Db,
  tenantId: string,
  jobId: string,
  record: (kind: string) => Promise<void>,
): Promise<Requeued> {
  const row = await readJobToRequeue(db, tenantId, jobId);
  if (!row) return { outcome: "not_found" };
  if (row.state !== "failed") return { outcome: "not_failed", state: row.state };
  if (SPEAKS_TO_A_PERSON.has(row.kind)) return { outcome: "speaks_to_a_person", kind: row.kind };
  // A kind a newer deploy wrote and this one does not know (failed after a day unknown) waits for the deploy that does.
  const kind = JOB_KINDS.find((k) => k === row.kind);
  if (!kind) return { outcome: "unknown_kind", kind: row.kind };
  await record(kind);
  const again = await scheduleJobOnce(db, { tenantId, kind, dueAt: new Date(), payload: row.payload });
  return again === "scheduled" ? { outcome: "requeued", kind } : { outcome: "already_scheduled" };
}
