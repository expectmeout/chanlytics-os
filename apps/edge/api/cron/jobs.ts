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
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database (migration 00078).
 */
import crypto from "node:crypto";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { alertFor } from "../../lib/job-alert.js";

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
  if (error) return json(503, { ok: false, error: error.message });
  if (!stale?.length) return json(200, { ok: true, reaped: 0 });

  let reaped = 0;
  let messages = 0;
  for (const job of stale) {
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

  return json(200, { ok: true, reaped, messages, seen: stale.length });
}
