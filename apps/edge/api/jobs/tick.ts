/**
 * The ledger's heartbeat, edge half.
 *
 * pg_cron asks every ten seconds whether anything in the ledger is due and
 * calls this only when something is (trigger_jobs_tick, 00098). Auth, the
 * database and each job's own tenant credentials are bound here; the loop is
 * packages/jobs/src/tick.ts, which is tested by running it against fakes.
 *
 * Its ceiling is apps/edge/vercel.json's, and the ledger's timings hang off
 * it: jobs are claimed one at a time for the first CLAIM_FOR_MS, a looping
 * handler yields at YIELD_AT_MS, and a claim's lease outlives the whole
 * function (ops-hygiene.test.mjs holds that last one to the ceiling).
 */
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger, errField } from "../../lib/log.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { alertFor } from "../../lib/job-alert.js";
import { waCredentialsForTenant } from "../../lib/tenant-runtime.js";
import { smsSenderForTenant } from "../../lib/sms.js";
import { deleteThread } from "../../lib/store.js";
import {
  runTick, claimNext, completeJob, failJob, settleJob, dispatchJob, scheduleJob,
  CLAIM_FOR_MS, YIELD_AT_MS, LEASE_SECONDS,
} from "../../lib/workspace/jobs.js";

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "jobs" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const denied = await authorizeCron(request, db);
  if (denied) return denied;

  try {
    const counts = await runTick(
      {
        claim: (lease) => claimNext(db, lease),
        dispatch: async (job, deadline) =>
          dispatchJob(
            {
              db,
              // The TENANT's credentials, never the environment's: a second
              // business's reply must not leave from the first one's number.
              waCfg: await waCredentialsForTenant(db, job.tenant_id),
              // The texting line's sender, when the workspace has one.
              sms: await smsSenderForTenant(db, job.tenant_id),
              alert: alertFor(db, job),
              // The edge is the only runtime holding BLOB_READ_WRITE_TOKEN.
              eraseThread: deleteThread,
              // A job that continues itself (a broadcast's next batch) is one
              // more row, as this job's tenant.
              schedule: async (kind, dueAt, payload) => {
                await scheduleJob(db, { tenantId: job.tenant_id, kind, dueAt, payload });
              },
              deadline,
            },
            { id: job.id, tenant_id: job.tenant_id, kind: job.kind, payload: (job.payload ?? {}) as Record<string, unknown> },
          ),
        complete: (job) => completeJob(db, job),
        fail: (job, reason) => failJob(db, job, reason),
        settle: (job, certain) => settleJob(db, job, certain),
        alert: (job, subject, body) => alertFor(db, job)(subject, body),
        log: L,
        now: Date.now,
      },
      { claimForMs: CLAIM_FOR_MS, yieldAtMs: YIELD_AT_MS, leaseSeconds: LEASE_SECONDS },
    );
    L.info("jobs_tick", { ...counts });
    return json(200, { ok: true, ...counts });
  } catch (e) {
    // Only the claim throws out of runTick; everything per job is caught inside
    // it. A ledger that cannot be claimed from is a database problem, and a 503
    // is what sweep_health() reads as one.
    L.error("jobs_tick_failed", { error: errField(e) });
    return json(503, { ok: false, error: errField(e) });
  }
}
