/**
 * The jobs ledger: the rules a row moves by, and the writes that move it.
 *
 *   scheduled --claim_due_jobs--> fired --completeJob--> done
 *       |                         |  ^  \-----failJob------> failed
 *       |                         \--/ deferJob: kept, and claimed again later
 *       \--------cancelJob---------> canceled
 *
 * `claim_due_jobs` (00098) is the only way into 'fired', and it also takes back
 * a 'fired' row whose lease ran out: the run that held it never reported back,
 * or a run that threw put its lease off (`deferJob`) to be tried again then.
 * Whether that later claim RUNS the job or GIVES UP on it is `verdictFor`, and
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

/**
 * The ceiling every tick function runs under (apps/edge/vercel.json: 60s).
 * Stated here because the lead job's window below is measured from it.
 */
export const FUNCTION_CEILING_MS = 60_000;

/**
 * The deadline a LEAD job is handed, from the tick's start. A broadcast's
 * deadline stops fifteen seconds short of the ceiling so a send in flight can
 * come back; a lead job guards every call it makes with its own margin
 * (core runner.ts DEADLINE_MARGIN_MS, JUDGE_MARGIN_MS), so nothing of its is
 * ever in flight past its deadline and it needs no room after it. Its
 * deadline sits at the ceiling less the kill margin the runner already keeps.
 *
 * Why this exists: the runner would not start the judge with less than the
 * judge's whole timeout left, which is right; but the last job a tick claims
 * (CLAIM_FOR_MS in) had YIELD_AT_MS - CLAIM_FOR_MS = 25 seconds to its
 * deadline against a 40-second judge, so only a collect claimed in a tick's
 * first seconds ever judged, and every other one retried into the same
 * arithmetic until the ledger gave up ("out of time before the judge", three
 * attempts, failed). The window a lead job is promised is
 * LEAD_YIELD_AT_MS - CLAIM_FOR_MS, and core's judge timeout is sized to fit
 * inside it; tick-geometry.test.mjs holds the two to that.
 */
export const LEAD_YIELD_AT_MS = FUNCTION_CEILING_MS - 8_000;

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

/**
 * Kinds tried again after they THROW, and how long each wait is.
 *
 * A job that throws is failed at once (tick.ts), and failed is final
 * (jobs_guard). email_ingest is written to be run again: its message is
 * recorded under the provider's id and marked handled last, so "the next try
 * finishes it" (core ingestEmail). But nothing tried again, and its own index
 * (00127) refused a second row for the same email, failed or not, so a webhook
 * replay could not bring one back either (00135 lets a failed row go): an
 * intake that threw once lost the email. It
 * happened on email's first day live (18 Sep 2026), to an email that arrived
 * while the deployment's key could send but not read (401 restricted_api_key).
 * The key was replaced sixteen minutes later.
 *
 * The wait is the LEASE. The row stays 'fired' with its lease put off, and
 * claim_due_jobs takes it back when the lease ends, as it takes back a run that
 * died (jobs_guard keeps a row fired, and never lets it go back to scheduled).
 * So every try is a claim, MAX_ATTEMPTS bounds them all, and the last one still
 * fails the row and tells the owner: five minutes, then thirty, covers a
 * provider's bad minute and a key replaced within the half hour.
 *
 * Only internal work that is safe to repeat belongs here. Work that speaks to a
 * person never does.
 */
export const RETRY_WAITS_MS: Readonly<Record<string, readonly number[]>> = {
  email_ingest: [5 * 60_000, 30 * 60_000],
  // The lead finder's three (00140). Each is written to be run again: a start
  // claims its run row before it calls the provider, a collect commits a page
  // by compare-and-set on the offset, a check commits by lead id. A
  // provider's 429 or 5xx throws and lands here: two minutes covers a bad
  // minute, ten a short outage; the third claim fails the row and the round
  // ends "the source failed". Every wait outlasts the lease (jobs-ledger.test.mjs).
  lead_round_start: [2 * 60_000, 10 * 60_000],
  lead_collect: [2 * 60_000, 10 * 60_000],
  lead_check: [2 * 60_000, 10 * 60_000],
};

/** How long a job that just threw waits before it is tried again; null when it is failed now. */
export function retryWait(job: { kind: string; attempts: number }): number | null {
  if (SPEAKS_TO_A_PERSON.has(job.kind) || job.attempts >= MAX_ATTEMPTS) return null;
  return RETRY_WAITS_MS[job.kind]?.[job.attempts - 1] ?? null;
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

/**
 * Keep a job that threw, to be claimed again once `untilIso` passes
 * (retryWait): its lease is put off and why is kept on the row. The same
 * compare-and-swap as the exits, so false means this run no longer holds it.
 */
export async function deferJob(
  db: Db,
  job: { id: string; attempts: number },
  untilIso: string,
  reason: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .update({ lease_until: untilIso, last_error: reason.slice(0, 500) })
    .eq("id", job.id)
    .eq("state", "fired")
    .eq("attempts", job.attempts)
    .select("id");
  if (error) throw new Error(`defer_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
