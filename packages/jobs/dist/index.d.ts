import { SupabaseClient } from '@supabase/supabase-js';
import { Json, Database } from '@chanlytics/db';
import { JobKind } from '@chanlytics/contracts';
import { WaConfig } from '@chanlytics/channels';

declare const FIRE_URL = "https://chanlytics-messaging.vercel.app/api/jobs/fire";
interface ScheduleParams {
    tenantId: string;
    kind: JobKind;
    dueAt: Date;
    payload: Json;
    qstashToken: string;
}
declare function scheduleJob(db: SupabaseClient<Database>, p: ScheduleParams): Promise<{
    jobId: string;
    cancelToken: string;
}>;
/** Cancel while still scheduled; the fire gate makes post-claim cancels no-op. */
declare function cancelJob(db: SupabaseClient<Database>, jobId: string, qstashToken?: string): Promise<boolean>;
/** Cancel every scheduled job of a kind for one subject (e.g. pause_expire on hand-back). */
declare function cancelJobsFor(db: SupabaseClient<Database>, tenantId: string, kind: JobKind, payloadKey: string, payloadValue: string, qstashToken?: string): Promise<number>;

/**
 * Job handlers — dispatched by the edge's /api/jobs/fire AFTER the claim_job
 * gate (exactly-once scheduled->fired). Handlers are idempotent against
 * re-dispatch and receive their environment injected (no env reads here).
 */

interface JobContext {
    db: SupabaseClient<Database>;
    waCfg: WaConfig;
    alert: (subject: string, body: string) => Promise<void>;
    /**
     * Delete one customer's stored Blob thread.
     *
     * INJECTED, not imported. The store is apps/edge/lib/store.ts because the
     * edge is the runtime that holds BLOB_READ_WRITE_TOKEN, and a package must
     * not reach into an app. Optional because the type is shared with any future
     * runner; a runner that cannot do it must FAIL, never succeed quietly —
     * see blobThreadErase.
     */
    eraseThread?: (namespace: string, threadId: string) => Promise<boolean>;
    /**
     * Schedule a job of this tenant — how a broadcast continues itself, one
     * batch after another, through the same door the dashboard uses. Optional
     * for the same reason eraseThread is; a runner without it must FAIL a
     * broadcast that has more to send, never end it quietly.
     */
    schedule?: (kind: JobKind, dueAt: Date, payload: Json) => Promise<void>;
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

export { type ClaimedJob, type EscalationOutcome, FIRE_URL, type JobContext, type ScheduleParams, cancelJob, cancelJobsFor, dispatchJob, scheduleJob, upsertEscalation };
