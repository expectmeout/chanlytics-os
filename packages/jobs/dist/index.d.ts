import { Database, Json } from '@chanlytics/db';
import { JobKind, JobNews, PushMessage } from '@chanlytics/contracts';
import { SupabaseClient } from '@supabase/supabase-js';
import { ReceivedEmail } from '@chanlytics/channels';
import { Wire, EmailIngestPorts, IncomingEmail } from '@chanlytics/core';

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
/**
 * The ceiling every tick function runs under (apps/edge/vercel.json: 60s).
 * Stated here because the lead job's window below is measured from it.
 */
declare const FUNCTION_CEILING_MS = 60000;
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
declare const LEAD_YIELD_AT_MS: number;
/** Claims allowed for internal work before it is failed and reported. */
declare const MAX_ATTEMPTS = 3;
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
declare const MAX_RESUMES = 5;
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
declare const RETRY_WAITS_MS: Readonly<Record<string, readonly number[]>>;
/** How long a job that just threw waits before it is tried again; null when it is failed now. */
declare function retryWait(job: {
    kind: string;
    attempts: number;
}): number | null;
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
 * Keep a job that threw, to be claimed again once `untilIso` passes
 * (retryWait): its lease is put off and why is kept on the row. The same
 * compare-and-swap as the exits, so false means this run no longer holds it.
 */
declare function deferJob(db: Db, job: {
    id: string;
    attempts: number;
}, untilIso: string, reason: string): Promise<boolean>;

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
 * The same insert, for a kind the ledger holds at most one of per subject (a
 * unique index on its payload: email_ingest, 00127). A second insert for the
 * same subject is the provider delivering its webhook again, and is answered
 * as the fact it is rather than thrown: the work is already on the ledger.
 */
declare function scheduleJobOnce(db: Db, p: ScheduleParams): Promise<"scheduled" | "already_scheduled">;
/**
 * Withdraw every scheduled job of a kind for one subject, in one statement.
 * A job already claimed is past withdrawing; from there the handler's own
 * checks are the guard (an outbound_send re-reads its message, and a canceled
 * message is not sent).
 */
declare function cancelJobsFor(db: Db, tenantId: string, kind: JobKind, payloadKey: string, payloadValue: string): Promise<number>;

/**
 * Flagging a thread for a person, once per hold: the job handlers and the ledger's settle both do it, so it lives
 * apart from either. Here, rather than in handlers.ts, so that settling a job that died does not load the core.
 */

/**
 * How an escalation landed.
 *
 *   opened     a new open row: nobody was waiting on this thread before.
 *   changed    a thread already waiting, for a DIFFERENT reason, which this
 *              one has now replaced.
 *   refreshed  the same reason saying itself again, with newer words.
 *   failed     nothing was written.
 *
 * `changed` exists because a thread has exactly one open escalation, so a
 * second reason overwrites the first -- and every caller that alerts only on
 * `opened` therefore said NOTHING when the reason a person was needed for
 * changed underneath them. An email arriving on a thread held for the carriers
 * was the case that showed it, but it was never an email bug: it was true of
 * every caller of this function.
 *
 * Callers that alert a human alert once per HOLD, not once per message -- and
 * a hold that now means something else is a different hold.
 */
type EscalationOutcome = "opened" | "changed" | "refreshed" | "failed";
declare function upsertEscalation(db: SupabaseClient<Database>, tenantId: string, conversationId: string, reason: string, details: string): Promise<EscalationOutcome>;

/**
 * What every job handler is handed: the job as it was claimed, and the context its ports are built from. Moved whole
 * from handlers.ts (Reach out Part 2.5), which re-exports its public names.
 */

interface PushReceipt {
    to: string;
    status: "ok" | "error";
    /** Expo's name for what went wrong; "DeviceNotRegistered" is a phone to forget. */
    error?: string;
}
interface PushPort {
    send(messages: PushMessage[]): Promise<PushReceipt[]>;
}
interface JobContext {
    db: SupabaseClient<Database>;
    /**
     * The job's own tenant's wires, bound by the edge where the credentials
     * are: WhatsApp on the tenant's credentials, the texting line when the
     * workspace has one. A null wire is a refusal at the door, never a guess
     * from the environment.
     */
    wire: Wire;
    /** Tell this job's tenant. The news carries its own kind and door (contracts JobNews); the runtime that addresses it never chooses them. */
    alert: (news: JobNews) => Promise<void>;
    /**
     * The platform's own pager, for a condition that is the platform's: a
     * provider refusing sends with 401 or 403 is credentials, not content.
     * Optional so a test context need not supply one.
     */
    page?: (key: string, subject: string, body: string) => Promise<unknown>;
    /**
     * Run a line's provisioning saga, or resume it. INJECTED, not imported:
     * the provider and the receptionist's credentials live on the edge, and a
     * package must not reach into an app. The saga reads its own receipts, so a
     * second run repeats nothing. Optional so a test context need not supply
     * one; a job of this kind in a runtime without it fails loudly rather than
     * guessing.
     */
    provisionLine?: (lineId: string, by: "owner" | "support" | "sweep", 
    /** No provider call starts after this (the job's deadline); the saga stops between two and says `more`. */
    deadline?: number) => Promise<{
        ok: boolean;
        step?: string;
        error?: string;
        did?: string;
        more?: boolean;
    }>;
    /**
     * Email's intake, as the edge holds it. INJECTED like the one above: the
     * provider's key and the deployment's mail domain live on the edge, and so
     * does the read of who asked to be forgotten. Optional so a test context
     * need not supply one; an email_ingest job in a runtime without it fails
     * loudly rather than guessing.
     */
    email?: {
        /** The deployment's mail domain: what a mailbox's local part is an address on. */
        domain: string;
        /** One received email by the provider's id; null when the provider has none such. Throws when it cannot be asked. */
        fetch: (receivedId: string) => Promise<ReceivedEmail | null>;
        /** Was this email received before a person with this address asked to be forgotten (00125's digest)? */
        erasedBefore: (tenantId: string, address: string, receivedAtIso: string) => Promise<boolean>;
        /** Tell the workspace's people an email is waiting: the edge's notify, addressed from that workspace. Never throws. */
        tell: (tenantId: string, note: Parameters<EmailIngestPorts["tell"]>[1]) => Promise<void>;
    };
    /**
     * The lead finder's pipeline (00140), as the edge holds it. INJECTED like
     * the two above: the provider's token, the judge's client and the
     * webhook base live on the edge (release A2 binds them). Optional so a
     * test context need not supply one; a lead job in a runtime without it
     * fails loudly rather than guessing. Each takes the claimed job whole and
     * bounds itself to one page or one batch before ctx.deadline.
     */
    leads?: {
        roundStart: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
        collect: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
        check: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
    };
    /**
     * The phones: one message each through Expo's push service, as the edge
     * binds it (lib/ops/push.ts). INJECTED like email's intake. A receipt per
     * message, in order; a transport failure throws and the ledger tries again.
     */
    push?: PushPort;
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

/**
 * The provider's email, as the verb takes it: what it claims to be, its words
 * as plain text, and its thread ids read out of its headers. The parsing is
 * here, in the adapter, so the verb knows no provider (hygiene.test.mjs).
 */
declare function incomingEmailOf(e: ReceivedEmail): IncomingEmail;
declare function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind">;

interface TerminalJob {
    id: string;
    kind: string;
    tenant_id: string;
    payload: unknown;
}
/** One thing a job was in the middle of, and what became of it. */
interface Settled {
    /** The kind of row, in the words the product uses for it. */
    what: "message" | "broadcast" | "email";
    /** True only when a row was found still in flight and moved: marked failed, or handed to a fresh run. */
    changed: boolean;
    /** A message that never left flagged its thread for a person: a new hold, or the one already open (I5). */
    flagged?: EscalationOutcome;
    /**
     * An email intake that died marked the workspace's mailbox. Absent when the
     * job named no mailbox; "gone" when no such mailbox is this workspace's any
     * more; "failed" when the write itself did not land. Said rather than
     * swallowed, and none of the three costs anybody their escalation.
     */
    mailbox?: "marked" | "gone" | "failed";
    /** Why nothing could be written, when nothing could be. Never swallowed. */
    error?: string;
    /**
     * The broadcast carries on. `changed` says whether THIS settlement is what
     * handed it on: false means a run was already coming and nothing needed doing.
     */
    resumed?: boolean;
    /**
     * The broadcast was marked failed INSTEAD of handed to a fresh run, and this
     * is why. Separate from `error`, which means nothing could be written at all:
     * reported as one, the owner reads "it may still show as sending" about a
     * broadcast that is, in fact, marked failed.
     */
    notResumed?: string;
    reached?: number;
    remaining?: number;
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
    /** Keep a job that threw, to be claimed again once `untilIso` passes (ledger deferJob). False when this run no longer holds it. */
    defer(job: LedgerRow, untilIso: string, reason: string): Promise<boolean>;
    /** Never throws: a write that failed comes back as a row with its error. */
    settle(job: LedgerRow, certain: boolean): Promise<Settled[]>;
    alert(job: LedgerRow, news: JobNews): Promise<void>;
    log: TickLog;
    now(): number;
}
interface TickOptions {
    /** Claim new work only this long after the tick starts. */
    claimForMs: number;
    /** Handlers are handed `start + yieldAtMs` as their deadline. */
    yieldAtMs: number;
    /** A kind's own yield, when it differs (a lead job's, ledger.ts LEAD_YIELD_AT_MS); `yieldAtMs` otherwise. */
    yieldAtFor?: (kind: string) => number | undefined;
    leaseSeconds: number;
}
interface TickCounts {
    claimed: number;
    done: number;
    failed: number;
    gaveUp: number;
    /** Threw, and kept to be tried again later (ledger RETRY_WAITS_MS). */
    deferred: number;
}
declare function runTick(ports: TickPorts, opts: TickOptions): Promise<TickCounts>;

export { CLAIM_FOR_MS, type ClaimedJob, type Db, type EscalationOutcome, FUNCTION_CEILING_MS, type JobContext, LEAD_YIELD_AT_MS, LEASE_SECONDS, type LedgerRow, MAX_ATTEMPTS, MAX_RESUMES, type PushPort, type PushReceipt, RETRY_WAITS_MS, RUN_INTERRUPTED, SPEAKS_TO_A_PERSON, type ScheduleParams, type Settled, type TerminalJob, type TickCounts, type TickFields, type TickLog, type TickOptions, type TickPorts, type Verdict, YIELD_AT_MS, cancelJobsFor, claimNext, completeJob, deferJob, dispatchJob, failJob, incomingEmailOf, retryWait, runTick, saySettled, scheduleJob, scheduleJobOnce, settleJob, upsertEscalation, verdictFor };
