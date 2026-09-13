/**
 * The jobs ledger: the rules a row moves by, and the writes that move it.
 *
 *   scheduled --claim_due_jobs--> fired --completeJob--> done
 *       |                           \-----failJob------> failed
 *       \--------cancelJob---------> canceled
 *
 * `claim_due_jobs` (00098) is the only way into 'fired', and it also takes back
 * a 'fired' row whose lease ran out: the run that held it never reported back.
 * Whether that second claim RUNS the job or GIVES UP on it is `verdictFor`, and
 * it is pure. `jobs_guard` (00098) refuses every other transition inside the
 * database, so no writer here has to remember the machine.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@chanlytics/db";

export type Db = SupabaseClient<Database>;

/**
 * How long one claim holds a row. Longer than the runner's function may live
 * (apps/edge/vercel.json gives api/jobs/tick.ts 60 seconds; ops-hygiene.test.mjs
 * holds the two together), so a row is never taken back while the run that
 * claimed it can still be inside a provider call.
 */
export const LEASE_SECONDS = 90;

/**
 * How long a tick keeps claiming. Jobs are claimed one at a time, just before
 * each runs, and only in the first twenty seconds, so the last one claimed
 * still has forty of the sixty before the function is killed.
 */
export const CLAIM_FOR_MS = 20_000;

/**
 * When a handler that loops over outward work (a broadcast batch) stops
 * starting new sends and leaves the rest to a follow-up job. Fifteen seconds
 * before the ceiling: room for the send already in flight to come back.
 */
export const YIELD_AT_MS = 45_000;

/** Claims allowed for internal work before it is failed and reported. */
export const MAX_ATTEMPTS = 3;

/**
 * Fresh runs a broadcast may be handed before it is failed instead.
 *
 * MAX_ATTEMPTS cannot reach the resume: settleJob mints a NEW row, with its own
 * attempts of one, so a broadcast whose run dies the same way every time would
 * fail, resume, fail for ever — one owner alert and one new row per cycle. The
 * count rides the payload and is reset by a run that got far enough to schedule
 * its own next batch, so this bounds resumes THAT MADE NO PROGRESS, not the
 * number of batches a long broadcast takes.
 */
export const MAX_RESUMES = 5;

/** Kinds whose second run could reach a real person a second time. */
export const SPEAKS_TO_A_PERSON: ReadonlySet<string> = new Set(["outbound_send", "broadcast_send"]);

export const RUN_INTERRUPTED = "the run did not finish; its outcome is unknown";

export interface LedgerRow {
  id: string;
  tenant_id: string;
  kind: string;
  payload: Json;
  due_at: string;
  /** Counted by the claim: 1 on the first run; more means a lease ran out before a run reported back. */
  attempts: number;
}

export type Verdict = "run" | "give_up";

/**
 * A job is claimed immediately before it runs, so a second claim means a run
 * STARTED and never reported back. For work that speaks to a person that is
 * the one case that must not be repeated: the run may have died after the
 * provider accepted the message and before the row recorded it, and a second
 * text to a real person cannot be taken back. Internal work is idempotent and
 * is tried again, up to a cap.
 */
export function verdictFor(job: { kind: string; attempts: number }): Verdict {
  if (job.attempts <= 1) return "run";
  if (SPEAKS_TO_A_PERSON.has(job.kind)) return "give_up";
  return job.attempts > MAX_ATTEMPTS ? "give_up" : "run";
}

/** The next due job, claimed for this run; null when nothing is due. */
export async function claimNext(db: Db, leaseSeconds: number): Promise<LedgerRow | null> {
  const { data, error } = await db.rpc("claim_due_jobs", { p_limit: 1, p_lease_seconds: leaseSeconds });
  if (error) throw new Error(`claim_due_jobs: ${error.message}`);
  const rows: LedgerRow[] = data ?? [];
  return rows[0] ?? null;
}

/**
 * Both exits compare-and-swap on the state AND the claim. A run whose lease ran
 * out and was taken back must not be able to finish the row out from under the
 * run that holds it now; zero rows means exactly that, and the caller says so.
 */
export async function completeJob(db: Db, job: { id: string; attempts: number }): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .update({ state: "done", lease_until: null })
    .eq("id", job.id)
    .eq("state", "fired")
    .eq("attempts", job.attempts)
    .select("id");
  if (error) throw new Error(`complete_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function failJob(db: Db, job: { id: string; attempts: number }, reason: string): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .update({ state: "failed", last_error: reason.slice(0, 500), lease_until: null })
    .eq("id", job.id)
    .eq("state", "fired")
    .eq("attempts", job.attempts)
    .select("id");
  if (error) throw new Error(`fail_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
