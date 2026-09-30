/**
 * The ledger's heartbeat, edge half.
 *
 * pg_cron asks every ten seconds whether anything in the ledger is due and
 * calls this only when something is (trigger_jobs_tick, 00098). Auth, the
 * database and each job's own tenant credentials are bound here; the loop is
 * packages/jobs/src/tick.ts, which is tested by running it against fakes.
 *
 * Its ceiling is apps/edge/vercel.json's, and the ledger's timings hang off
 * it: jobs are claimed one at a time, in CLAIM_SLOTS slots side by side, for
 * the first CLAIM_FOR_MS, a looping handler yields at YIELD_AT_MS, and a
 * claim's lease outlives the whole function (ops-hygiene.test.mjs holds that
 * last one to the ceiling).
 */
import { json, refuse } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger, errField, door } from "../../lib/log.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { alertFor } from "../../lib/ops/job-alert.js";
import { waCredentialsForTenant } from "../../lib/tenant-runtime.js";
import { smsSenderForTenant } from "../../lib/sms/sms.js";
import { emailWireFor, emailIntake } from "../../lib/email/email.js";
import { isWireUnavailable, whatsappWire, wireUnavailable } from "../../lib/packages/core.js";
import { pageOperator } from "../../lib/ops/page-operator.js";
import { provisionLineJob } from "../../lib/lines/line-provision-job.js";
import { leadPipeline } from "../../lib/leads/lead-pipeline.js";
import { expoPush } from "../../lib/ops/push.js";
import { replyReader } from "../../lib/reach-out/reply-read.js";
import {
  runTick,
  claimNext,
  completeJob,
  failJob,
  deferJob,
  settleJob,
  dispatchJob,
  scheduleJob,
  scheduleJobOnce,
  lateFields,
  CLAIM_FOR_MS,
  CLAIM_SLOTS,
  REPLY_LATE_PAGE_MS,
  YIELD_AT_MS,
  LEAD_YIELD_AT_MS,
  LEASE_SECONDS,
} from "../../lib/packages/jobs.js";

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

/** The reply-lane page: how long the worst one waited, and where to look first. */
function replyLateBody(worstMs: number): string {
  return (
    `A reply was claimed ${Math.round(worstMs / 1000)} s after it was due. Replies are claimed before any other work ` +
    `(jobs.lane 0), so every runner was busy with replies, or the ledger's heartbeat was slow to start one.\n\n` +
    `The jobs_tick lines in the edge's logs carry late_ms_<kind> for each kind's worst wait and reply_late_ms for the ` +
    `reply lane's; sweep_health() says whether the 'jobs' clock is running.\n`
  );
}

export const POST = door(async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "jobs" });
  const db = pg();
  if (!db) return refuse(503, "no_database");
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
          // either is a refusal at the door, not a guess; a read that FAILED
          // is neither (core whatsappWire, WireUnavailable): the reply waits
          // for a heartbeat that can read the vault. Email's provider key
          // is the deployment's, so its wire is bound to the tenant's MAILBOX:
          // it sends a frozen request only when that request leaves as this
          // workspace, and a workspace without a mailbox has no email line.
          const line = await smsSenderForTenant(db, job.tenant_id);
          // Each wire is bound on its own: a mailbox that could not be read is email's wire unbound (core
          // WireUnavailable), never a throw that fails a WhatsApp or SMS reply that needed no email at all.
          const email = await emailWireFor(db, job.tenant_id).catch((e: unknown) => {
            L.error("email_wire_unavailable", { tenant_id: job.tenant_id, error: errField(e) });
            return wireUnavailable(errField(e));
          });
          // Email's intake: the provider fetch and the mail domain live here. Absent where email is off.
          const intake = emailIntake(db);
          // The lead finder's pipeline: absent without APIFY_TOKEN, and a lead job then fails by name.
          const leads = leadPipeline();
          const wire = {
            whatsapp: whatsappWire(await waCredentialsForTenant(db, job.tenant_id)),
            sms:
              line === null || isWireUnavailable(line)
                ? line
                : (to: string, p: { body: string }) => line.send(to.startsWith("+") ? to : `+${to}`, p.body),
            ...(email !== undefined ? { email } : {}),
          };
          return dispatchJob(
            {
              db,
              wire,
              alert: alertFor(db, job),
              page: (key, subject, body) => pageOperator({ db }, key, subject, body),
              // The phones, through Expo's push service: no per-tenant credential, one transport for all.
              push: expoPush(),
              provisionLine: (lineId, by, until) => provisionLineJob(db, job.tenant_id, lineId, by, undefined, until),
              ...(intake ? { email: intake } : {}),
              ...(leads ? { leads } : {}),
              // The reading of a reach-out's reply: the model, the spend and the notice. With no model key it
              // reads nothing and says so (no_model), and the reply is read again later.
              replies: replyReader(db),
              // A job that continues itself (a broadcast's next batch) is one
              // more row, as this job's tenant.
              schedule: async (kind, dueAt, payload) => {
                await scheduleJob(db, { tenantId: job.tenant_id, kind, dueAt, payload });
              },
              // Work the ledger holds once per subject (a reply's reading), as this job's tenant.
              scheduleOnce: (kind, dueAt, payload) =>
                scheduleJobOnce(db, { tenantId: job.tenant_id, kind, dueAt, payload }),
              deadline,
            },
            {
              id: job.id,
              tenant_id: job.tenant_id,
              kind: job.kind,
              payload: (job.payload ?? {}) as Record<string, unknown>,
            },
          );
        },
        complete: (job) => completeJob(db, job),
        fail: (job, reason) => failJob(db, job, reason),
        defer: (job, untilIso, reason) => deferJob(db, job, untilIso, reason),
        // Nothing ran, so the claim is given back: the next runner to claim it finds a first claim.
        deferUnknown: (job, untilIso, reason) => deferJob(db, job, untilIso, reason, true),
        settle: (job, certain) => settleJob(db, job, certain),
        alert: (job, news) => alertFor(db, job)(news),
        log: L,
        now: Date.now,
        random: Math.random,
      },
      {
        claimForMs: CLAIM_FOR_MS,
        slots: CLAIM_SLOTS,
        yieldAtMs: YIELD_AT_MS,
        yieldAtFor: (kind) => (kind.startsWith("lead_") ? LEAD_YIELD_AT_MS : undefined),
        leaseSeconds: LEASE_SECONDS,
      },
    );
    // How late each kind's first claim came rides on the heartbeat's line (0018,
    // step 1), and the reply lane's worst beside them; the answer to pg_net keeps its counts alone.
    const { lateMs, replyLateMs, ...tally } = counts;
    L.info("jobs_tick", { ...tally, ...lateFields(lateMs), reply_late_ms: replyLateMs });
    // A reply that waited more than a minute for the ledger is the platform's condition: replies are claimed before
    // anything else, so every runner was busy with replies or the heartbeat was slow. Paged once per window.
    if (replyLateMs > REPLY_LATE_PAGE_MS) {
      await pageOperator(
        { db },
        "jobs_replies_late",
        "A reply waited more than a minute for the ledger",
        replyLateBody(replyLateMs),
      );
    }
    // Many failures in one heartbeat are also the platform's condition: one page
    // with the counts in words and where to look. Each failed job has already
    // alerted its own workspace's owner (packages/jobs/src/tick.ts); the page is
    // in addition to those, not instead of them.
    if (tally.failed + tally.gaveUp >= MASS_FAILURE_PAGE) {
      await pageOperator(
        { db },
        "jobs_mass_failure",
        `${tally.failed + tally.gaveUp} jobs failed in one heartbeat`,
        massFailureBody(tally),
      );
    }
    return json(200, { ok: true, ...tally });
  } catch (e) {
    // Only the claim throws out of runTick; everything per job is caught inside
    // it. A ledger that cannot be claimed from is a database problem, and a 503
    // is what sweep_health() reads as one.
    L.error("jobs_tick_failed", { error: errField(e) });
    return refuse(503, "query_failed", errField(e));
  }
});
