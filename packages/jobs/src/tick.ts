/**
 * One heartbeat over the ledger.
 *
 * pg_cron asks every ten seconds whether anything is due (trigger_jobs_tick,
 * 00098) and calls api/jobs/tick.ts only when something is. That route binds
 * the database and each job's tenant credentials into ports and hands them
 * here; this file imports neither, so it is tested by running it.
 *
 * EACH JOB CLAIMED IMMEDIATELY BEFORE IT RUNS. A batch claimed up front and
 * worked through in turn leaves every job behind the running one 'fired' but
 * not started, and when the function is killed those come back on their next
 * claim looking exactly like runs that died mid-send, so a reply nobody ever
 * tried to send would be failed as "outcome unknown". Claiming one at a time
 * keeps "claimed" meaning "started", which is the fact verdictFor stands on.
 * A tick may run a few jobs side by side (`slots`, ledger CLAIM_SLOTS): each
 * slot is a runner of its own that claims one job, runs it, and claims the
 * next, so the rule holds slot by slot.
 */
import { jittered, jobNewsWords, type JobEnd, type JobNews } from "@chanlytics/contracts";
import {
  verdictFor,
  retryWait,
  RUN_INTERRUPTED,
  UNKNOWN_KIND_GIVE_UP_MS,
  UNKNOWN_KIND_WAIT_MS,
  type LedgerRow,
} from "./ledger";
import { saySettled, type Settled } from "./settle";

export type TickFields = Record<string, string | number | boolean | null | undefined>;

export interface TickLog {
  info(event: string, fields?: TickFields): void;
  warn(event: string, fields?: TickFields): void;
  error(event: string, fields?: TickFields): void;
}

export interface TickPorts {
  /** The next due job, claimed for this run; null when nothing is due. */
  claim(leaseSeconds: number): Promise<LedgerRow | null>;
  /** Run it. `deadline` is when a handler that loops must stop starting new outward work. */
  dispatch(job: LedgerRow, deadline: number): Promise<"done" | "unknown_kind">;
  complete(job: LedgerRow): Promise<boolean>;
  fail(job: LedgerRow, reason: string): Promise<boolean>;
  /** Keep a job that threw, to be claimed again once `untilIso` passes (ledger deferJob). False when this run no longer holds it. */
  defer(job: LedgerRow, untilIso: string, reason: string): Promise<boolean>;
  /** Keep a job of a kind this runner does not know, its claim given back (ledger deferUnknownJob). False when this run no longer holds it. */
  deferUnknown(job: LedgerRow, untilIso: string, reason: string): Promise<boolean>;
  /** Never throws: a write that failed comes back as a row with its error. */
  settle(job: LedgerRow, certain: boolean): Promise<Settled[]>;
  alert(job: LedgerRow, news: JobNews): Promise<void>;
  log: TickLog;
  now(): number;
  /** The draw a retry's wait is lengthened by (contracts jittered); Math.random when absent. */
  random?: () => number;
}

export interface TickOptions {
  /** Claim new work only this long after the tick starts. */
  claimForMs: number;
  /** Handlers are handed `start + yieldAtMs` as their deadline. */
  yieldAtMs: number;
  /** A kind's own yield, when it differs (a lead job's, ledger.ts LEAD_YIELD_AT_MS); `yieldAtMs` otherwise. */
  yieldAtFor?: (kind: string) => number | undefined;
  leaseSeconds: number;
  /** How many jobs run side by side, each claimed just before it runs (ledger CLAIM_SLOTS); one when absent. */
  slots?: number;
}

export interface TickCounts {
  claimed: number;
  done: number;
  failed: number;
  gaveUp: number;
  /** Threw, and kept to be tried again later (ledger RETRY_WAITS_MS). */
  deferred: number;
  /**
   * How late each kind's first claim came, at worst, in milliseconds past its row's due time (decision 0018, step 1).
   * A later claim of the same row is a retry or a lease that ran out, not a wait in the queue, so it is not counted.
   */
  lateMs: Record<string, number>;
  /**
   * The worst of those among the reply lane's (jobs.lane 0, read from the claimed row): a member's reply, an email
   * arriving, a phone told. `outbound_send` is both a reply and a cold email, so its kind's number cannot say; this
   * one can, and it is the one the route pages on (REPLY_LATE_PAGE_MS).
   */
  replyLateMs: number;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Keep the worst wait among a kind's first claims: now, less the row's due time; a claim before it waited none. */
function noteLate(c: TickCounts, job: LedgerRow, now: number): void {
  if (job.attempts !== 1) return;
  const late = Math.max(0, now - Date.parse(job.due_at));
  if (Number.isNaN(late)) return;
  c.lateMs[job.kind] = Math.max(c.lateMs[job.kind] ?? 0, late);
  if (job.lane === 0) c.replyLateMs = Math.max(c.replyLateMs, late);
}

/** The heartbeat's line is flat, so each kind's worst wait is a field of its own: `late_ms_<kind>`. */
export function lateFields(lateMs: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(lateMs).map(([kind, ms]) => [`late_ms_${kind}`, ms]));
}

export async function runTick(ports: TickPorts, opts: TickOptions): Promise<TickCounts> {
  const started = ports.now();
  const deadlineFor = (kind: string) => started + (opts.yieldAtFor?.(kind) ?? opts.yieldAtMs);
  const c: TickCounts = { claimed: 0, done: 0, failed: 0, gaveUp: 0, deferred: 0, lateMs: {}, replyLateMs: 0 };
  const slots = Math.max(1, Math.floor(opts.slots ?? 1));
  const running: Promise<void>[] = [];
  // Set by the first claim that throws; every slot stops claiming, and the tick throws once what runs has finished.
  const halt: { stopped: boolean; error: unknown } = { stopped: false, error: null };

  const slot = async (): Promise<void> => {
    for (let now = ports.now(); now - started < opts.claimForMs && !halt.stopped; now = ports.now()) {
      // Only the claim may throw out of here. A ledger that cannot be claimed
      // from is the database's problem, and the route answers 503 so that
      // sweep_health() reports it as one; the other slots claim nothing more.
      let job: LedgerRow | null;
      try {
        job = await ports.claim(opts.leaseSeconds);
      } catch (e) {
        if (!halt.stopped) Object.assign(halt, { stopped: true, error: e });
        return;
      }
      if (!job) return;
      c.claimed += 1;
      noteLate(c, job, now);
      // The job starts before anything else is asked of the ledger (runOne's first step is synchronous up to the
      // handler's own call). Work was due, so more may be: another slot opens beside this one, and it too claims only
      // what it is about to run.
      const run = runOne(ports, job, deadlineFor(job.kind), c);
      if (running.length < slots) running.push(slot());
      await run;
    }
  };
  running.push(slot());
  for (let i = 0; i < running.length; i += 1) await running[i];
  if (halt.stopped) throw halt.error;
  return c;
}

/** One claimed job, run and recorded; everything per job is caught here, so one job's throw is never another's. */
async function runOne(ports: TickPorts, job: LedgerRow, deadline: number, c: TickCounts): Promise<void> {
  if (verdictFor(job) === "give_up") {
    await conclude(ports, job, RUN_INTERRUPTED, false, "unfinished");
    c.gaveUp += 1;
    return;
  }

  let outcome: "done" | "unknown_kind";
  try {
    outcome = await ports.dispatch(job, deadline);
  } catch (e) {
    const msg = errText(e);
    // A kind written to be run again is kept and tried again later, rather
    // than failed for good on its first throw (ledger RETRY_WAITS_MS). The
    // last try falls through to the failure below, and is told as one.
    const wait = retryWait(job, ports.random);
    if (wait !== null) {
      const until = await keepForLater(ports, job, wait, (untilIso) => ports.defer(job, untilIso, msg));
      if (until) ports.log.warn("job_deferred", keptFields(job, until, msg));
      c.deferred += 1;
      return;
    }
    await conclude(ports, job, msg, false, "failed");
    c.failed += 1;
    return;
  }

  if (outcome === "unknown_kind") {
    // A kind a newer deploy wrote waits for the runner that knows it (ledger UNKNOWN_KIND_WAIT_MS), so either app
    // may deploy first. One nobody has known for a day is failed as never run, and its owner told.
    const reason = `unknown job kind ${job.kind}`;
    if (!(ports.now() - Date.parse(job.due_at) >= UNKNOWN_KIND_GIVE_UP_MS)) {
      const wait = jittered(UNKNOWN_KIND_WAIT_MS, ports.random);
      const until = await keepForLater(ports, job, wait, (untilIso) => ports.deferUnknown(job, untilIso, reason));
      if (until) ports.log.warn("job_kind_unknown_deferred", keptFields(job, until, reason));
      c.deferred += 1;
      return;
    }
    await conclude(ports, job, reason, true, "unknown_kind");
    c.failed += 1;
    return;
  }

  // The work is done; what follows only records it. A write that fails here
  // must not be reported as the work failing: the lease brings the row back
  // and verdictFor judges it, which for a send is an honest "unknown" rather
  // than a false "failed".
  try {
    if (await ports.complete(job)) c.done += 1;
    else ports.log.warn("job_complete_lost_race", { job_id: job.id, kind: job.kind, attempts: job.attempts });
  } catch (e) {
    ports.log.error("job_complete_write_failed", { job_id: job.id, kind: job.kind, error: errText(e) });
  }
}

/**
 * Keep a job to be claimed again `wait` ms on: the moment it comes back, or null when it is not kept (another run holds
 * it now, or the write failed, each said on the log). A write that failed is not a failure of the job either: the
 * claim's own lease still brings the row back, sooner.
 */
async function keepForLater(
  ports: TickPorts,
  job: LedgerRow,
  wait: number,
  write: (untilIso: string) => Promise<boolean>,
): Promise<string | null> {
  const untilIso = new Date(ports.now() + wait).toISOString();
  try {
    if (await write(untilIso)) return untilIso;
    ports.log.warn("job_defer_lost_race", { job_id: job.id, kind: job.kind, attempts: job.attempts });
  } catch (d) {
    ports.log.error("job_defer_write_failed", { job_id: job.id, kind: job.kind, error: errText(d) });
  }
  return null;
}

/** What the line for a kept job says. */
const keptFields = (job: LedgerRow, until: string, why: string): TickFields => ({
  job_id: job.id,
  tenant_id: job.tenant_id,
  kind: job.kind,
  attempts: job.attempts,
  until,
  error: why,
});

/**
 * Fail the row, settle what it left behind, tell the owner what became of it.
 * Each step is best effort relative to the one before, because a recorded
 * failure must never turn into an unrecorded one: a settlement that could not
 * be written is said in the alert, and an alert that could not be sent is logged.
 *
 * The owner is told in their own words, on the page the work belongs to
 * (contracts jobNewsWords). It used to be `A lead_collect job failed`, over
 * the job's id, with a door to the Inbox whatever the job was. The id, the
 * kind and the error still travel, as the body's last line, for whoever reads
 * the email to the end; the bell shows only the first.
 */
async function conclude(
  ports: TickPorts,
  job: LedgerRow,
  reason: string,
  certain: boolean,
  end: JobEnd,
): Promise<void> {
  let failed: boolean;
  try {
    failed = await ports.fail(job, reason);
  } catch (e) {
    ports.log.error("job_fail_write_failed", { job_id: job.id, kind: job.kind, error: errText(e) });
    return;
  }
  if (!failed) {
    // Another run concluded this row first. Nothing to settle, nothing new to say.
    ports.log.warn("job_fail_lost_race", { job_id: job.id, kind: job.kind, attempts: job.attempts });
    return;
  }

  let wreckage: string | null;
  try {
    const settled = await ports.settle(job, certain);
    for (const s of settled) {
      if (s.error) ports.log.error("job_settle_failed", { job_id: job.id, what: s.what, error: s.error });
      // Written, but not the write that was wanted: the broadcast is failed
      // rather than carried on, and why is worth a line of its own.
      else if (s.notResumed)
        ports.log.warn("broadcast_not_resumed", { job_id: job.id, tenant_id: job.tenant_id, reason: s.notResumed });
    }
    wreckage = saySettled(settled);
  } catch (e) {
    ports.log.error("job_settle_failed", { job_id: job.id, error: errText(e) });
    wreckage =
      "What it was in the middle of could not be checked, so a message or broadcast may still show as sending.";
  }
  ports.log.info("job_failed", {
    job_id: job.id,
    tenant_id: job.tenant_id,
    kind: job.kind,
    attempts: job.attempts,
    reason,
  });

  try {
    // conclude() is only ever reached for a job that failed or never came
    // back, so this is the one place job_failed is the truth.
    const words = jobNewsWords(job.kind, end, job.attempts);
    const reference = `Reference: job ${job.id} (${job.kind}): ${reason}.`;
    await ports.alert(job, {
      kind: "job_failed",
      route: words.to,
      subject: words.title,
      body: [words.lead, wreckage, reference].filter(Boolean).join("\n\n"),
    });
  } catch (e) {
    ports.log.error("job_alert_failed", { job_id: job.id, error: errText(e) });
  }
}
