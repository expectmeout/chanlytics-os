/**
 * The sweep for jobs that never came back.
 *
 * `claim_job` flips a job to 'fired' and the handler runs. If the lambda dies
 * in between — a timeout, a cold-start failure, a deploy mid-flight — the row
 * stays 'fired' for ever. Nothing swept it, nothing retried it, and fire.ts
 * deliberately answers 200 so QStash will not either ("our ledger owns retry
 * policy"). So the one state a job could not leave was the one nobody chose.
 *
 * For an `outbound_send` that means a reply the operator believes is on its
 * way sits as "Sending…" indefinitely, which is exactly the failure fire.ts
 * alerts about when the handler throws — the difference being that a handler
 * that never returns told nobody at all.
 *
 * It marks, it does not retry. A crash between `send()` returning ok and the
 * status write landing leaves the message still 'queued', so re-firing would
 * deliver it a second time to a real person. The honest report is that the
 * run did not finish and its outcome is unknown, said to the owner, once.
 *
 * THE OTHER HALF. A job whose QStash message never arrived stays 'scheduled'
 * past its time for ever: nothing reads due_at, and the pass above filters on
 * 'fired'. Three causes, one bug — QStash exhausting its retries into the
 * dead-letter queue, this endpoint answering 401, and the signing keys being
 * rotated without the edge being told. The last of those puts EVERY job in the
 * product here at once, and today that is indistinguishable from a quiet week.
 *
 * That half is re-published rather than marked, which is the opposite of the
 * decision above and deliberately so: a job nothing ever claimed provably
 * never ran, so the work still needs doing. See lib/jobs-recovery.ts.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database (migration 00078).
 */
import crypto from "node:crypto";
import { Client } from "@upstash/qstash";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { alertFor } from "../../lib/job-alert.js";
import { FIRE_URL } from "../../lib/workspace/jobs.js";
import { recoveryFor, OVERDUE_AFTER_MS } from "../../lib/jobs-recovery.js";

export const config = { maxDuration: 60 };

/**
 * fire.ts may run for 60 seconds. Ten minutes is far past any honest finish
 * and far short of the quarter-hour between ticks, so a job is never judged
 * while it might still be working.
 */
export const STALE_AFTER_MS = 10 * 60_000;

/** A bound per tick; a backlog drains over successive ticks rather than one long call. */
const MAX_PER_TICK = 50;

export const RUN_INTERRUPTED = "the run did not finish; its outcome is unknown";
export const NEVER_DELIVERED = "the job was scheduled but its delivery never arrived";

type Db = NonNullable<ReturnType<typeof pg>>;

/**
 * Ask QStash to deliver this job again, on the row it already has.
 *
 * Not scheduleJob: that inserts a NEW row, and this job's row is the thing
 * being rescued. `notBefore` is omitted because the job is already overdue —
 * there is nothing left to wait for. The deduplication id is the job id and
 * QStash's window is ten minutes, so at forty-five this is accepted rather
 * than silently dropped; `claim_job` is what stops a late original and this
 * one both firing.
 */
async function republishJob(db: Db, jobId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("no QSTASH_TOKEN");
  const res = await new Client({ token }).publishJSON({
    url: FIRE_URL,
    body: { job_id: jobId },
    deduplicationId: jobId,
  });
  await db.from("jobs").update({ qstash_id: res.messageId }).eq("id", jobId);
}

/**
 * A broadcast whose chain broke sits in 'sending' with some recipients done
 * and nothing coming: broadcastSend schedules its own next batch, so one lost
 * link strands the whole run. Conditional on 'sending', so a broadcast that
 * finished between the read and here is left exactly as it finished.
 */
async function releaseBroadcast(db: Db, job: { kind: string; tenant_id: string; payload: unknown }): Promise<boolean> {
  if (job.kind !== "broadcast_send") return false;
  const id = typeof job.payload === "object" && job.payload !== null
    ? (job.payload as Record<string, unknown>).broadcast_id
    : null;
  if (typeof id !== "string") return false;
  const { data } = await db
    .from("broadcasts")
    .update({ state: "failed", finished_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", job.tenant_id)
    .eq("state", "sending")
    .select("id");
  return !!data?.length;
}

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "jobs" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error: keyErr } = await db.rpc("get_cron_sweep_key");
  if (keyErr || !expected) return json(503, { ok: false, error: "key_unavailable" });
  if (!presented || !secretsMatch(presented, expected as unknown as string)) return json(401, { ok: false, error: "unauthorized" });

  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data: stale, error } = await db
    .from("jobs")
    .select("id, tenant_id, kind, payload, fired_at")
    .eq("state", "fired")
    .lt("fired_at", cutoff)
    .order("fired_at", { ascending: true })
    .limit(MAX_PER_TICK);
  // NEITHER of these returns. There are two passes over two halves of the
  // ledger, and an early exit here means the overdue half runs only on the
  // rare tick that also finds a stuck job — which is how this shipped green
  // and did nothing, until a probe job proved otherwise.
  if (error) L.error("stuck_read_failed", { error: error.message });

  let reaped = 0;
  let messages = 0;
  for (const job of stale ?? []) {
    // `.eq("state", "fired")` is the gate, not a filter: two overlapping ticks,
    // or a handler that comes back late, must not both report the same job.
    // Zero rows means somebody else got there first, and there is nothing to
    // say about it.
    const { data: won, error: takeErr } = await db
      .from("jobs")
      .update({ state: "failed", last_error: RUN_INTERRUPTED })
      .eq("id", job.id)
      .eq("state", "fired")
      .select("id");
    if (takeErr) {
      L.error("stale_job_mark_failed", { job_id: job.id, error: takeErr.message });
      continue;
    }
    if (!won?.length) continue;
    reaped += 1;

    // The reply the operator is watching. Conditional on 'queued' for the same
    // reason: if the handler DID record the send before dying, that row is
    // already 'sent' and saying otherwise would be a lie about a message that
    // reached someone. Only a row still claiming to be on its way is touched.
    const messageId = typeof job.payload === "object" && job.payload !== null
      ? (job.payload as Record<string, unknown>).message_id
      : null;
    if (job.kind === "outbound_send" && typeof messageId === "string") {
      const { data: stuck } = await db
        .from("messages")
        .update({ status: "failed", error: { reason: "run_interrupted", note: RUN_INTERRUPTED } })
        .eq("id", messageId)
        .eq("tenant_id", job.tenant_id)
        .eq("status", "queued")
        .select("id");
      if (stuck?.length) messages += 1;
    }

    L.info("stale_job_reaped", { job_id: job.id, tenant_id: job.tenant_id, kind: job.kind, fired_at: job.fired_at });
    try {
      await alertFor(db, job)(
        `A ${job.kind} job did not finish`,
        `Job ${job.id} (${job.kind}) started and never reported back, so ${RUN_INTERRUPTED}.\n\n` +
        (job.kind === "outbound_send"
          ? "If this was a reply, it may or may not have reached the customer — check the conversation before sending it again."
          : "Nothing retries it on its own."),
      );
    } catch (e) {
      // Alerting is best effort: it must not turn a recorded reaping into an
      // unrecorded one.
      L.error("stale_job_alert_failed", { job_id: job.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ---------------------------------------------------------------- the other half
  const overdueBefore = new Date(Date.now() - OVERDUE_AFTER_MS).toISOString();
  const { data: overdue, error: oErr } = await db
    .from("jobs")
    .select("id, tenant_id, kind, payload, due_at, republishes")
    .eq("state", "scheduled")
    .lt("due_at", overdueBefore)
    .order("due_at", { ascending: true })
    .limit(MAX_PER_TICK);
  if (oErr) {
    L.error("overdue_read_failed", { error: oErr.message });
    return json(200, { ok: true, reaped, messages, overdue_error: oErr.message });
  }

  let republished = 0;
  let gaveUp = 0;
  let broadcasts = 0;
  for (const job of overdue ?? []) {
    const verdict = recoveryFor(job);
    if (verdict === "wait") continue;

    if (verdict === "republish") {
      // The counter first, conditional on the job still being unclaimed: a
      // delivery that lands between the read and here has already claimed it,
      // and publishing again would be asking for work nobody needs.
      const { data: won, error: cErr } = await db
        .from("jobs")
        .update({ republishes: job.republishes + 1 })
        .eq("id", job.id)
        .eq("state", "scheduled")
        .select("id");
      if (cErr || !won?.length) continue;
      try {
        await republishJob(db, job.id);
        republished += 1;
        L.info("jobs_republished", { job_id: job.id, tenant_id: job.tenant_id, kind: job.kind, due_at: job.due_at, republishes: job.republishes + 1 });
      } catch (e) {
        // A sweep that dies on the first bad publish rescues nothing. The
        // counter has already gone up, so a QStash outage drains into give-ups
        // rather than looping.
        L.error("jobs_republish_failed", { job_id: job.id, error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    const { data: won, error: fErr } = await db
      .from("jobs")
      .update({ state: "failed", last_error: NEVER_DELIVERED })
      .eq("id", job.id)
      .eq("state", "scheduled")
      .select("id");
    if (fErr || !won?.length) continue;
    gaveUp += 1;
    if (await releaseBroadcast(db, job)) broadcasts += 1;
    L.info("jobs_gave_up", { job_id: job.id, tenant_id: job.tenant_id, kind: job.kind, due_at: job.due_at, republishes: job.republishes });
    try {
      await alertFor(db, job)(
        `A ${job.kind} job never ran`,
        `Job ${job.id} (${job.kind}) was due ${job.due_at} and its delivery never arrived, after ${job.republishes} attempt${job.republishes === 1 ? "" : "s"} to send it again. ${NEVER_DELIVERED}.\n\n` +
        (job.kind === "broadcast_send"
          ? "The broadcast has been marked failed; the people it had already reached still got it."
          : "Nothing else will run it."),
      );
    } catch (e) {
      L.error("jobs_giveup_alert_failed", { job_id: job.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json(200, {
    ok: true, reaped, messages, republished, gaveUp, broadcasts,
    seen: (stale?.length ?? 0) + (overdue?.length ?? 0),
  });
}
