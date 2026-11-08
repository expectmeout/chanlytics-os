/**
 * What GET /api/health judges, read: each clock's health and the job ledger's backlog, side by side (packages/db ops).
 * The door holds no client of its own (DOOR_FORBIDS), so the read is here and the judgement stays the door's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import { readJobsBacklog, readSweepHealth } from "@chanlytics/db/ops";

/** The client's door calls the judgement needs, so a test can hand it a fake that answers them. */
export type HealthDb = Pick<SupabaseClient<Database>, "rpc">;

/** Each clock's health and the job ledger's backlog, read side by side. */
export function readPlatformHealth(db: HealthDb) {
  return Promise.all([readSweepHealth(db), readJobsBacklog(db)]);
}
