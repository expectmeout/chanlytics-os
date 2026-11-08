/**
 * The jobs ledger's own reads and writes, as the runner makes them (packages/jobs runner, decision 0111): the next due job
 * claimed, a fired job's row changed only while this run still holds it (its state and its claim compared and swapped),
 * a job written, a subject's scheduled jobs withdrawn, and a subject's live jobs counted. Each answer is the database's as
 * it came; the runner says its failures in its own words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

import type { SchemaSet } from "@chanlytics/contracts";
type Db = SupabaseClient<Database>;
type JobsUpdate = Database["public"]["Tables"]["jobs"]["Update"];
type JobsInsert = Database["public"]["Tables"]["jobs"]["Insert"];

/** The next due job, claimed for this run with a lease (claim_due_jobs). */
export const claimDueJob = async (db: Db, leaseSeconds: number) =>
  db.rpc("claim_due_jobs", { p_limit: 1, p_lease_seconds: leaseSeconds });

/** That the job is about to speak (jobs.spoke_at), only while this run holds it: its claim compared when it is known. */
export function stampJobSpoke(db: Db, job: { id: string; attempts?: number }, at: string) {
  const write = db.from("jobs").update({ spoke_at: at }).eq("id", job.id).eq("state", "fired");
  return (job.attempts !== undefined ? write.eq("attempts", job.attempts) : write).select("id");
}

/** A fired job's row changed only while this run holds it: no row back means its lease was taken back. */
export const swapFiredJob = async (db: Db, job: { id: string; attempts: number }, patch: JobsUpdate) =>
  db.from("jobs").update(patch).eq("id", job.id).eq("state", "fired").eq("attempts", job.attempts).select("id");

/** A job written to the ledger, its id back. */
export const insertJob = async (db: Db, row: JobsInsert) => db.from("jobs").insert(row).select("id").single();

/** A job written to the ledger where its once-only key may refuse it (23505: the same subject's job is on it already). */
export const insertJobOnce = async (db: Db, row: JobsInsert) => db.from("jobs").insert(row);

/**
 * Every scheduled job of a kind for one subject withdrawn, in one statement. `payloadKey` is a plain JSON key the caller
 * has checked: it is written into a PostgREST filter's column.
 */
export const cancelScheduledJobs = async (
  db: Db,
  params: { tenantId: string; kind: SchemaSet<"jobs.kind">; payloadKey: string; payloadValue: string },
) =>
  db
    .from("jobs")
    .update({ state: "canceled" })
    .eq("tenant_id", params.tenantId)
    .eq("kind", params.kind)
    .eq("state", "scheduled")
    .eq(`payload->>${params.payloadKey}`, params.payloadValue)
    .select("id");

/** How many of a broadcast's jobs are scheduled or running, the asking job aside. */
export const countLiveBroadcastJobs = async (
  db: Db,
  params: { tenantId: string; broadcastId: string; besides: string },
) =>
  db
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", params.tenantId)
    .eq("kind", "broadcast_send")
    .eq("payload->>broadcast_id", params.broadcastId)
    .in("state", ["scheduled", "fired"])
    .neq("id", params.besides);

/** The live jobs of `kind` (scheduled or fired) naming any of these messages, with `dueSince` only those due after it. */
export const listLiveJobsNaming = async (
  db: Db,
  kind: SchemaSet<"jobs.kind">,
  messageIds: string[],
  dueSince?: string,
) => {
  const query = db
    .from("jobs")
    .select("payload")
    .eq("kind", kind)
    .in("state", ["scheduled", "fired"])
    .in("payload->>message_id", messageIds);
  return dueSince ? query.gt("due_at", dueSince) : query;
};
