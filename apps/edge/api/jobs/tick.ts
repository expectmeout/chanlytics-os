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
import { emailWireFor, emailIntake } from "../../lib/email.js";
import { deleteThread } from "../../lib/store.js";
import { whatsappSender } from "../../lib/workspace/core.js";
import { pageOperator } from "../../lib/page-operator.js";
import { provisionLineJob } from "../../lib/line-provision-job.js";
import { leadPipeline } from "../../lib/lead-pipeline.js";
import {
  runTick, claimNext, completeJob, failJob, deferJob, settleJob, dispatchJob, scheduleJob,
  CLAIM_FOR_MS, YIELD_AT_MS, LEASE_SECONDS,
} from "../../lib/workspace/jobs.js";

/** This many failures in one heartbeat are the platform's, not any owner's. */
const MASS_FAILURE_PAGE = 10;

/**
 * The mass-failure page: the counts in words, and where to look first. It comes
 * on top of the owners' own alerts, never instead of them.
 */
function massFailureBody(c: { claimed: number; done: number; failed: number; gaveUp: number }): string {
  return (
    `${c.failed + c.gaveUp} of the ${c.claimed} jobs this heartbeat claimed failed: ${c.failed} while running, ` +
    `and ${c.gaveUp} given up because their last run never reported back. ${c.done} finished.\n\n` +
    `Each one is a row in jobs with state 'failed', and each also alerted its own workspace's owner as usual. Newest first:\n\n` +
    `  select kind, tenant_id, attempts, last_error, updated_at from jobs where state = 'failed' order by updated_at desc limit 20;\n\n` +
    `The same last_error across several workspaces points to a shared cause: a provider's credentials, the database, or a deploy.\n`
  );
}

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "jobs" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;

  try {
    const counts = await runTick(
      {
        claim: (lease) => claimNext(db, lease),
        dispatch: async (job, deadline) => {
          // The job's wires, bound here where the credentials are: the
          // TENANT's WhatsApp credentials, never the environment's (a second
          // business's reply must not leave from the first one's number), and
          // the texting line's sender when the workspace has one. Null on
          // either is a refusal at the door, not a guess. Email's provider key
          // is the deployment's, so its wire is bound to the tenant's MAILBOX:
          // it sends a frozen request only when that request leaves as this
          // workspace, and a workspace without a mailbox has no email line.
          const line = await smsSenderForTenant(db, job.tenant_id);
          const email = await emailWireFor(db, job.tenant_id);
          // Email's intake: the provider fetch and the mail domain live here. Absent where email is off.
          const intake = emailIntake(db);
          // The lead finder's pipeline: absent without APIFY_TOKEN, and a lead job then fails by name.
          const leads = leadPipeline();
          const wire = {
            whatsapp: whatsappSender(await waCredentialsForTenant(db, job.tenant_id)),
            sms: line ? (to: string, p: { body: string }) => line.send(to.startsWith("+") ? to : `+${to}`, p.body) : null,
            ...(email !== undefined ? { email } : {}),
          };
          return dispatchJob(
            {
              db,
              wire,
              alert: alertFor(db, job),
              page: (key, subject, body) => pageOperator({ db }, key, subject, body),
              // The edge is the only runtime holding BLOB_READ_WRITE_TOKEN.
              eraseThread: deleteThread,
              provisionLine: (lineId, by) => provisionLineJob(db, lineId, by),
              ...(intake ? { email: intake } : {}),
              ...(leads ? { leads } : {}),
              // A job that continues itself (a broadcast's next batch) is one
              // more row, as this job's tenant.
              schedule: async (kind, dueAt, payload) => {
                await scheduleJob(db, { tenantId: job.tenant_id, kind, dueAt, payload });
              },
              deadline,
            },
            { id: job.id, tenant_id: job.tenant_id, kind: job.kind, payload: (job.payload ?? {}) as Record<string, unknown> },
          );
        },
        complete: (job) => completeJob(db, job),
        fail: (job, reason) => failJob(db, job, reason),
        defer: (job, untilIso, reason) => deferJob(db, job, untilIso, reason),
        settle: (job, certain) => settleJob(db, job, certain),
        alert: (job, news) => alertFor(db, job)(news),
        log: L,
        now: Date.now,
      },
      { claimForMs: CLAIM_FOR_MS, yieldAtMs: YIELD_AT_MS, leaseSeconds: LEASE_SECONDS },
    );
    L.info("jobs_tick", { ...counts });
    // Many failures in one heartbeat are also the platform's condition: one page
    // with the counts in words and where to look. Each failed job has already
    // alerted its own workspace's owner (packages/jobs/src/tick.ts); the page is
    // in addition to those, not instead of them.
    if (counts.failed + counts.gaveUp >= MASS_FAILURE_PAGE) {
      await pageOperator({ db }, "jobs_mass_failure", `${counts.failed + counts.gaveUp} jobs failed in one heartbeat`, massFailureBody(counts));
    }
    return json(200, { ok: true, ...counts });
  } catch (e) {
    // Only the claim throws out of runTick; everything per job is caught inside
    // it. A ledger that cannot be claimed from is a database problem, and a 503
    // is what sweep_health() reads as one.
    L.error("jobs_tick_failed", { error: errField(e) });
    return json(503, { ok: false, error: errField(e) });
  }
}
