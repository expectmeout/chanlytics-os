import { Database, Json } from '@chanlytics/db';
import { JobKind } from '@chanlytics/contracts';
import { SupabaseClient } from '@supabase/supabase-js';
import { WaConfig } from '@chanlytics/channels';

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

type Db = SupabaseClient<Database>;
/**
 * How long one claim holds a row. Longer than the runner's function may live
 * (apps/edge/vercel.json gives api/jobs/tick.ts 60 seconds; ops-hygiene.test.mjs
 * holds the two together), so a row is never taken back while the run that
 * claimed it can still be inside a provider call.
 */
declare const LEASE_SECONDS = 90;
/**
 * How long a tick keeps claiming. Jobs are claimed one at a time, just before
 * each runs, and only in the first twenty seconds, so the last one claimed
 * still has forty of the sixty before the function is killed.
 */
declare const CLAIM_FOR_MS = 20000;
/**
 * When a handler that loops over outward work (a broadcast batch) stops
 * starting new sends and leaves the rest to a follow-up job. Fifteen seconds
 * before the ceiling: room for the send already in flight to come back.
 */
declare const YIELD_AT_MS = 45000;
/** Claims allowed for internal work before it is failed and reported. */
declare const MAX_ATTEMPTS = 3;
/** Kinds whose second run could reach a real person a second time. */
declare const SPEAKS_TO_A_PERSON: ReadonlySet<string>;
declare const RUN_INTERRUPTED = "the run did not finish; its outcome is unknown";
interface LedgerRow {
    id: string;
    tenant_id: string;
    kind: string;
    payload: Json;
    due_at: string;
    /** Counted by the claim: 1 on the first run; more means a lease ran out before a run reported back. */
    attempts: number;
}
type Verdict = "run" | "give_up";
/**
 * A job is claimed immediately before it runs, so a second claim means a run
 * STARTED and never reported back. For work that speaks to a person that is
 * the one case that must not be repeated: the run may have died after the
 * provider accepted the message and before the row recorded it, and a second
 * text to a real person cannot be taken back. Internal work is idempotent and
 * is tried again, up to a cap.
 */
declare function verdictFor(job: {
    kind: string;
    attempts: number;
}): Verdict;
/** The next due job, claimed for this run; null when nothing is due. */
declare function claimNext(db: Db, leaseSeconds: number): Promise<LedgerRow | null>;
/**
 * Both exits compare-and-swap on the state AND the claim. A run whose lease ran
 * out and was taken back must not be able to finish the row out from under the
 * run that holds it now; zero rows means exactly that, and the caller says so.
 */
declare function completeJob(db: Db, job: {
    id: string;
    attempts: number;
}): Promise<boolean>;
declare function failJob(db: Db, job: {
    id: string;
    attempts: number;
}, reason: string): Promise<boolean>;

/**
 * Scheduling is one insert. The heartbeat (api/jobs/tick.ts, over
 * claim_due_jobs) runs whatever is due, so there is no second system to tell,
 * no publish that can be lost after the row is written, and no orphan to clean
 * up. Service-role territory (§8): never called with a session client.
 */

interface ScheduleParams {
    tenantId: string;
    kind: JobKind;
    dueAt: Date;
    payload: Json;
}
declare function scheduleJob(db: Db, p: ScheduleParams): Promise<{
    jobId: string;
}>;
/**
 * Withdraw every scheduled job of a kind for one subject, in one statement.
 * A job already claimed is past withdrawing; from there the handler's own
 * checks are the guard (an outbound_send re-reads its message, and a canceled
 * message is not sent).
 */
declare function cancelJobsFor(db: Db, tenantId: string, kind: JobKind, payloadKey: string, payloadValue: string): Promise<number>;

/**
 * Job handlers — dispatched by the edge's api/jobs/tick.ts once
 * claim_due_jobs() has made the job this run's (00098). Handlers are
 * idempotent against a second run and receive their environment injected
 * (no env reads here).
 */

interface JobContext {
    db: SupabaseClient<Database>;
    waCfg: WaConfig;
    /** The workspace's texting line, when it has one — injected by the edge like waCfg; null = no line. */
    sms?: {
        send(to: string, body: string): Promise<{
            ok: boolean;
            wamid: string | null;
            status: number;
            errorBody?: string;
        }>;
    } | null;
    alert: (subject: string, body: string) => Promise<void>;
    /**
     * Delete one customer's stored Blob thread.
     *
     * INJECTED, not imported. The store is apps/edge/lib/store.ts because the
     * edge is the runtime that holds BLOB_READ_WRITE_TOKEN, and a package must
     * not reach into an app.
     */
    eraseThread: (namespace: string, threadId: string) => Promise<boolean>;
    /**
     * Schedule a job of this tenant — how a broadcast continues itself, one
     * batch after another, through the same door the dashboard uses.
     */
    schedule: (kind: JobKind, dueAt: Date, payload: Json) => Promise<void>;
    /**
     * Epoch ms. A handler that loops over outward work starts no new send after
     * this and leaves the rest to a follow-up job through `schedule`. The runner
     * is killed at a fixed ceiling, and a send cut off mid-flight is a send
     * whose outcome nobody knows.
     */
    deadline: number;
}
interface ClaimedJob {
    id: string;
    tenant_id: string;
    kind: string;
    payload: Record<string, unknown>;
}
/** How an escalation landed: a new open row, a refresh of the one already
 *  open on that thread, or nothing (the insert failed for another reason).
 *  Callers that alert a human use it to alert once per hold, not once per
 *  message. */
type EscalationOutcome = "opened" | "refreshed" | "failed";
declare function upsertEscalation(db: SupabaseClient<Database>, tenantId: string, conversationId: string, reason: string, details: string): Promise<EscalationOutcome>;
declare function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind">;

/**
 * What a job leaves behind when it will not finish.
 *
 * The ledger row is only half the truth. A job that fails was in the middle of
 * something: an outbound_send that never ran left its message saying "Sending…"
 * for ever, and a broadcast whose run died sat in 'sending' with half its
 * recipients reached and nothing coming. Only the kind knows what it was in the
 * middle of, so settlement is per kind.
 *
 * `certain` says whether the work provably never happened: a job whose kind no
 * runner knows is certain; one that ran and threw, or ran and never came back,
 * is not. It changes the words recorded, never the conditions. Every write here
 * is conditional on the downstream row still claiming to be in flight, so a
 * handler that DID record its send before dying is left exactly as it left it
 * either way. That condition, not `certain`, is what makes this safe to run on
 * a job whose outcome is unknown.
 */

interface TerminalJob {
    id: string;
    kind: string;
    tenant_id: string;
    payload: unknown;
}
/** One thing a job was in the middle of, and what became of it. */
interface Settled {
    /** The kind of row, in the words the product uses for it. */
    what: "message" | "broadcast";
    /** True only when a row was found still in flight and marked failed. */
    changed: boolean;
    /** Why nothing could be written, when nothing could be. Never swallowed. */
    error?: string;
}
/**
 * Settle what this job was in the middle of. Never throws: a settlement that
 * cannot be written is reported in its own row, because the caller's job is to
 * tell an owner the truth and "we could not check" is part of the truth.
 */
declare function settleJob(db: Db, job: TerminalJob, certain: boolean): Promise<Settled[]>;
/**
 * The sentence an owner reads about the wreckage, or null when there is none.
 * Built from what the writes actually returned, which is the only version an
 * owner can act on.
 */
declare function saySettled(results: Settled[]): string | null;

/**
 * One heartbeat over the ledger.
 *
 * pg_cron asks every ten seconds whether anything is due (trigger_jobs_tick,
 * 00098) and calls api/jobs/tick.ts only when something is. That route binds
 * the database and each job's tenant credentials into ports and hands them
 * here; this file imports neither, so it is tested by running it.
 *
 * ONE JOB AT A TIME, claimed immediately before it runs. A batch claimed up
 * front and worked through in turn leaves every job behind the running one
 * 'fired' but not started, and when the function is killed those come back on
 * their next claim looking exactly like runs that died mid-send, so a reply
 * nobody ever tried to send would be failed as "outcome unknown". Claiming one
 * at a time keeps "claimed" meaning "started", which is the fact verdictFor
 * stands on.
 */

type TickFields = Record<string, string | number | boolean | null | undefined>;
interface TickLog {
    info(event: string, fields?: TickFields): void;
    warn(event: string, fields?: TickFields): void;
    error(event: string, fields?: TickFields): void;
}
interface TickPorts {
    /** The next due job, claimed for this run; null when nothing is due. */
    claim(leaseSeconds: number): Promise<LedgerRow | null>;
    /** Run it. `deadline` is when a handler that loops must stop starting new outward work. */
    dispatch(job: LedgerRow, deadline: number): Promise<"done" | "unknown_kind">;
    complete(job: LedgerRow): Promise<boolean>;
    fail(job: LedgerRow, reason: string): Promise<boolean>;
    /** Never throws: a write that failed comes back as a row with its error. */
    settle(job: LedgerRow, certain: boolean): Promise<Settled[]>;
    alert(job: LedgerRow, subject: string, body: string): Promise<void>;
    log: TickLog;
    now(): number;
}
interface TickOptions {
    /** Claim new work only this long after the tick starts. */
    claimForMs: number;
    /** Handlers are handed `start + yieldAtMs` as their deadline. */
    yieldAtMs: number;
    leaseSeconds: number;
}
interface TickCounts {
    claimed: number;
    done: number;
    failed: number;
    gaveUp: number;
}
declare function runTick(ports: TickPorts, opts: TickOptions): Promise<TickCounts>;

export { CLAIM_FOR_MS, type ClaimedJob, type Db, type EscalationOutcome, type JobContext, LEASE_SECONDS, type LedgerRow, MAX_ATTEMPTS, RUN_INTERRUPTED, SPEAKS_TO_A_PERSON, type ScheduleParams, type Settled, type TerminalJob, type TickCounts, type TickFields, type TickLog, type TickOptions, type TickPorts, type Verdict, YIELD_AT_MS, cancelJobsFor, claimNext, completeJob, dispatchJob, failJob, runTick, saySettled, scheduleJob, settleJob, upsertEscalation, verdictFor };
