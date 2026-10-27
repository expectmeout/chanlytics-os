/**
 * The ledger's heartbeat, edge half.
 *
 * The route is api/jobs/tick.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the
 * sweep key, then hands this its tick.
 *
 * pg_cron asks every ten seconds whether anything in the ledger is due and
 * calls this only when something is (trigger_jobs_tick, 00098). Auth and the
 * database are sweepDoor's; each job's own tenant credentials are bound here;
 * the loop is packages/jobs/src/tick.ts, which is tested by running it against fakes.
 *
 * Its ceiling is apps/edge/vercel.json's, and the ledger's timings hang off
 * it: jobs are claimed one at a time, in CLAIM_SLOTS slots side by side, for
 * the first CLAIM_FOR_MS, a looping handler yields at YIELD_AT_MS, and a
 * claim's lease outlives the whole function (ops-hygiene.test.mjs holds that
 * last one to the ceiling). Each is measured from the moment the door was
 * reached (sweepDoor's `started`), as the ceiling is.
 */
import { json, refuse } from "../http.js";
import { errField } from "../log.js";
import { alertFor } from "./job-alert.js";
import { whatsappWireForTenant } from "../tenant-runtime.js";
import { instagramWireForTenant } from "../instagram/credentials.js";
import { smsSenderForTenant } from "../sms/sms.js";
import { emailBoundFor, emailIntake } from "../email/email.js";
import { mailboxIntake } from "../email/mailbox/mailbox-intake.js";
import { historyImports } from "../imports/history-import.js";
import { websiteReader } from "../imports/website-read.js";
import { campaignsBinding } from "../email/campaigns-domain.js";
import { isWireUnavailable } from "../packages/core.js";
import { pageOperator } from "./page-operator.js";
import { provisionLineJob } from "../lines/line-provision-job.js";
import { leadPipeline } from "../leads/lead-pipeline.js";
import { expoPush } from "./push.js";
import { replyReader } from "../reach-out/reply-read.js";
import { bookingReader } from "../calendar/booking-read.js";
import { feedNamesFor } from "../calendar/feed-names.js";
import { answerInboundJob } from "../whatsapp/answer-later.js";
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
  RELAY_LIMIT,
  type ClaimedJob,
} from "../packages/jobs.js";
import { relayEvents, workspaceIsOurs } from "../packages/db.js";
import type { SweepTick } from "./sweep-door.js";

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

/** The operator's pager, for a failure that is the platform's (ledger PAGES_THE_PLATFORM): never an owner's bell. */
/**
 * The ledger's pager: one page per condition per window, and none for a job of our own workspaces (the nightly suite's,
 * the smoke test: decision 0068), whose failures Health shows under Ours instead.
 */
const pagerOf =
  (db: SweepTick["db"]) =>
  async (key: string, subject: string, body: string, tenantId?: string | null): Promise<unknown> =>
    tenantId && (await workspaceIsOurs(db, tenantId)) ? "ours" : pageOperator({ db }, key, subject, body);

/**
 * What the jobs bring in (decision 0073): a connection's history a part at a time (the mailbox's six months, its people,
 * its calendar, WhatsApp's), with the grants that live here, and the business's website read for Check (R10).
 */
const broughtIn = (db: Parameters<typeof historyImports>[0]) => ({
  imports: historyImports(db),
  website: websiteReader(db),
});

/**
 * A job's wires but email's, bound where the credentials are: the TENANT's WhatsApp credentials, never the environment's
 * (a second business's reply must not leave from the first one's number), each send from the number its person last
 * wrote to where the workspace has two (whatsappWireForTenant); the texting line's sender when the workspace has one; and
 * its Instagram account's, a member's reply and a held draft by DM leaving from the account the person last wrote to
 * (lib/instagram). Null on any is a refusal at the door, not a guess; a read that FAILED is neither (core
 * WireUnavailable): the reply waits for a heartbeat that can read the vault. Email's wire is bound to the workspace's own
 * addresses (its hosted mailbox, each mailbox it connected): it sends a frozen request only when it leaves as one.
 */
async function phoneWires(db: SweepTick["db"], tenantId: string) {
  const line = await smsSenderForTenant(db, tenantId);
  return {
    whatsapp: await whatsappWireForTenant(db, tenantId),
    instagram: await instagramWireForTenant(db, tenantId),
    sms:
      line === null || isWireUnavailable(line)
        ? line
        : (to: string, p: { body: string }) => line.send(to.startsWith("+") ? to : `+${to}`, p.body),
  };
}

export async function tickJobs({ db, L, started }: SweepTick): Promise<Response> {
  try {
    // The relay first (decision 0032, 00334): the outbox's events become deliveries and jobs, which this same tick then
    // claims. A relay that fails is said and costs the tick nothing else: the next knock, or the poll, drains it.
    let relayed: number | null = null;
    try {
      relayed = await relayEvents(db, RELAY_LIMIT);
    } catch (e) {
      L.error("events_relay_failed", { error: errField(e) });
    }
    const counts = await runTick(
      {
        claim: (lease) => claimNext(db, lease),
        dispatch: async (job, deadline) => {
          // Each wire is bound on its own (phoneWires): a mailbox that could not be read is email's wire unbound (core
          // WireUnavailable), never a throw that fails a WhatsApp or SMS reply that needed no email at all.
          // A broadcast's batch may send OFFERS by email: only for that job is the campaigns domain asked about (it is
          // kept five minutes) and bound, as the wire's route and the intake's lane; every other job never sees it. For a
          // domain the deployment names the answer is never "no lane": verified binds it, one the provider says is not
          // verified closes offers and the run stops, and one it could not be asked about makes a run of offers wait while
          // the email wire stays bound for everything else (emailBoundFor says each).
          const offers = job.kind === "broadcast_send" ? await campaignsBinding() : ({ state: "none" } as const);
          const { email, campaigns, closed, unread } = await emailBoundFor(db, job.tenant_id, offers, L);
          // Email's intake: the provider fetch and the mail domain live here. Absent where email is off.
          const intake = emailIntake(db, campaigns, closed, unread);
          // The lead finder's pipeline: absent without APIFY_TOKEN, and a lead job then fails by name.
          const leads = leadPipeline();
          const wire = { ...(await phoneWires(db, job.tenant_id)), ...(email !== undefined ? { email } : {}) };
          // The job as its handler holds it. What the handler says of it (that it spoke: ledger markSpoke) is carried
          // back to the claim once it returns or throws, where the ledger judges a retry from it.
          const claimed: ClaimedJob = {
            id: job.id,
            tenant_id: job.tenant_id,
            kind: job.kind,
            payload: (job.payload ?? {}) as Record<string, unknown>,
            attempts: job.attempts,
          };
          const ran = dispatchJob(
            {
              db,
              wire,
              alert: alertFor(db, job),
              page: pagerOf(db),
              // The phones, through Expo's push service: no per-tenant credential, one transport for all.
              push: expoPush(),
              provisionLine: (lineId, by, until) => provisionLineJob(db, job.tenant_id, lineId, by, undefined, until),
              ...(intake ? { email: intake } : {}),
              mailboxIntake: mailboxIntake(db), // a reply read back from a connected mailbox, with its grant (0056)
              ...(leads ? { leads } : {}),
              // The reading of a reach-out's reply (model, spend, notice): with no model key it says no_model and is read later.
              replies: replyReader(db),
              // The reading of a booking tool's notice: the model, the spend and the person it is for.
              bookings: bookingReader(db),
              calendar: { feedNames: feedNamesFor(db) }, // a reminder asks the owner's calendar beside the record
              // A message its door recorded and acknowledged, answered here: a text (decision 0031, Phase 2), or a
              // WhatsApp message of a workspace the edge names for it (Phase 3).
              inbound: { answer: (claimed) => answerInboundJob(db, claimed) },
              ...broughtIn(db),
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
            claimed,
          );
          return ran.finally(() => {
            if (claimed.spoke_at) job.spoke_at = claimed.spoke_at;
          });
        },
        complete: (job) => completeJob(db, job),
        fail: (job, reason) => failJob(db, job, reason),
        defer: (job, untilIso, reason) => deferJob(db, job, untilIso, reason),
        // Nothing ran, so the claim is given back: the next runner to claim it finds a first claim.
        deferUnknown: (job, untilIso, reason) => deferJob(db, job, untilIso, reason, true),
        settle: (job, certain) => settleJob(db, job, certain),
        alert: (job, news) => alertFor(db, job)(news),
        page: pagerOf(db),
        log: L,
        now: Date.now,
        random: Math.random,
      },
      {
        // The tick's clock is the door's: the key's read and the relay above (up to RELAY_LIMIT events) are inside the
        // function's sixty seconds, so they are inside the claim window and every deadline too. Started after them, a
        // send begun at the yield ran past the ceiling by as long as they took.
        startedAt: started,
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
    L.info("jobs_tick", { ...tally, relayed, ...lateFields(lateMs), reply_late_ms: replyLateMs });
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
}
