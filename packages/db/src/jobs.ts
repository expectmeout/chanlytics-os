/**
 * Rows of the jobs ledger, read for the back office's requeue door (packages/jobs requeueFailedJob). The ledger's own
 * writes (claim, complete, fail, defer, schedule) are packages/jobs' and name the table there; these are the two reads a
 * requeue makes, each in the workspace it is asked for, so a job of another workspace is not found.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";

type Db = SupabaseClient<Database>;

/** What a requeue needs of a job: what it was, how it ended, what it carried and when it was made. */
export interface JobToRequeue {
  id: string;
  kind: string;
  state: string;
  payload: Json;
  created_at: string;
}

/** The job with this id in this workspace, or null when there is none. */
export async function readJobToRequeue(db: Db, tenantId: string, jobId: string): Promise<JobToRequeue | null> {
  const { data, error } = await db
    .from("jobs")
    .select("id, kind, state, payload, created_at")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`read_job: ${error.message}`);
  return data;
}

/**
 * Whether the ledger already holds a copy of this job made after it: the same kind and payload, in this workspace,
 * not itself failed. A dead letter run again leaves that copy behind, so a second press (or a second person) finds it
 * and does not run the work twice.
 */
export async function hasNewerCopy(db: Db, tenantId: string, job: JobToRequeue): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", job.kind)
    .filter("payload", "eq", JSON.stringify(job.payload))
    .neq("state", "failed")
    .gt("created_at", job.created_at)
    .limit(1);
  if (error) throw new Error(`read_job_copies: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
