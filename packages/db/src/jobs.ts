/**
 * One row of the jobs ledger, read for the back office's requeue door (packages/jobs requeueFailedJob). The ledger's
 * own writes (claim, complete, fail, defer, schedule) are packages/jobs' and name the table there; this is the one read
 * of a row by its id, in the workspace it is asked for, so a job of another workspace is not found.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";

type Db = SupabaseClient<Database>;

/** What a requeue needs of a job: what it was, how it ended and what it carried. */
export interface JobToRequeue {
  id: string;
  kind: string;
  state: string;
  payload: Json;
}

/** The job with this id in this workspace, or null when there is none. */
export async function readJobToRequeue(db: Db, tenantId: string, jobId: string): Promise<JobToRequeue | null> {
  const { data, error } = await db
    .from("jobs")
    .select("id, kind, state, payload")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`read_job: ${error.message}`);
  return data;
}
