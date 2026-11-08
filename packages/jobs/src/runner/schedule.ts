/**
 * Scheduling is one insert. The heartbeat (api/jobs/tick.ts, over
 * claim_due_jobs) runs whatever is due, so there is no second system to tell,
 * no publish that can be lost after the row is written, and no orphan to clean
 * up. Service-role territory (§8): never called with a session client. The database writes each row's lane and its
 * once-only key from its kind's job_kinds row (00526), so a SQL function's insert and this one are held alike.
 *
 * A job scheduled while a request is being served carries that request's name
 * in its payload (`request_id`), and the tick runs the job under it: a click's
 * reply, the send it queued and the send's lines are one search in the log. A
 * payload that names one already keeps it, so a job a job schedules (a
 * broadcast's next batch) carries the request that started the chain.
 */
import { cancelScheduledJobs, hasRequeuedCopy, insertJob, insertJobOnce, readJobToRequeue } from "@chanlytics/db/jobs";
import type { Json } from "@chanlytics/db/types";
import { JOB_KINDS, type JobKind, recordOrEmpty, recordOrNull } from "@chanlytics/contracts";
import { logger, requestId } from "@chanlytics/log";
import { kindPolicyOf } from "./kinds";
import { SPEAKS_TO_A_PERSON, type Db } from "./ledger";
import type { TenantId } from "@chanlytics/contracts";

/** The payload with the request it was scheduled in, when there is one and it does not name one already. */
function named(payload: Json): Json {
  const id = requestId();
  if (!id || payload === null || typeof payload !== "object" || Array.isArray(payload) || "request_id" in payload)
    return payload;
  return { ...payload, request_id: id };
}

export interface ScheduleParams {
  tenantId: TenantId;
  kind: JobKind;
  dueAt: Date;
  payload: Json;
}

/**
 * Why a payload is not one its kind takes, or null when it is: an id its handler cannot run without that it does not name
 * (kinds.ts `ids`). Read at the write here and at the claim (handlers.ts dispatchJob), so a writer's slip fails loudly
 * where it was made, and a row nothing could run is never half-run.
 */
export function payloadRefusal(kind: string, payload: unknown): string | null {
  const policy = kindPolicyOf(kind);
  if (!policy) return null;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return "the payload is not an object";
  const p = recordOrEmpty(payload);
  const missing = policy.ids.filter((id) => typeof p[id] !== "string" || p[id] === "");
  return missing.length ? `the payload names no ${missing.join(", ")}` : null;
}

/**
 * The payload as the ledger keeps it: ids, not people (decision 0089). What the kind never carries (kinds.ts `never`: a
 * reply's words, a text's words) is left on the row it names, where its handler reads it and an erasure finds it, and
 * never copied onto the ledger.
 */
function idsOnly(kind: string, payload: Json): Json {
  const never = kindPolicyOf(kind)?.never ?? [];
  if (!never.length || payload === null || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return Object.fromEntries(Object.entries(payload).filter(([k]) => !never.includes(k)));
}

/**
 * The key a writer asks for, for the two kinds the database leaves unkeyed unless asked (job_kinds.once_parts null,
 * 00506): a lead round's start, and each batch of its checks, one waiting at a time among the writers that carry the key
 * (the sweep carrying a round on, a run's next, lead_collect_commit), while a door's own start (lead_round_answer, a
 * search made or widened) is never refused for one already waiting. A Check again carries its own nonce, so it is never
 * held behind the round's own checks.
 */
function askedKeyOf(kind: JobKind, payload: Json): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const round = typeof payload.round_id === "string" && payload.round_id !== "" ? payload.round_id : null;
  if (!round) return null;
  if (kind === "lead_round_start") return `lead_round_start:${round}`;
  if (kind !== "lead_check") return null;
  const again = typeof payload.again === "string" ? payload.again : "round";
  return `lead_check:${round}:${again}:${typeof payload.batch === "number" ? payload.batch : 0}`;
}

/**
 * The row an insert writes. Its once-only key and its lane are the database's to write (jobs_take_their_kind, 00526:
 * the kind's job_kinds row), whoever the writer is: this, the fifteen SQL functions that insert jobs, and a Console
 * requeue are held alike, and the rule is spelled once. The two lead kinds whose key a writer asks for are the one
 * exception (askedKeyOf).
 */
function rowToInsert(scheduleParams: ScheduleParams) {
  const refused = payloadRefusal(scheduleParams.kind, scheduleParams.payload);
  if (refused) throw new Error(`schedule_job: ${scheduleParams.kind}: ${refused}`);
  const askedKey = askedKeyOf(scheduleParams.kind, scheduleParams.payload);
  return {
    tenant_id: scheduleParams.tenantId,
    kind: scheduleParams.kind,
    due_at: scheduleParams.dueAt.toISOString(),
    payload: named(idsOnly(scheduleParams.kind, scheduleParams.payload)),
    ...(askedKey ? { dedupe_key: askedKey } : {}),
  };
}

export async function scheduleJob(db: Db, scheduleParams: ScheduleParams): Promise<{ jobId: string }> {
  const { data, error } = await insertJob(db, rowToInsert(scheduleParams));
  if (error || !data) throw new Error(`schedule_job: ${error?.message ?? "no row"}`);
  return { jobId: data.id };
}

/**
 * The same insert, for a kind the ledger holds at most one of per subject (its once-only key, job_kinds.once_parts). A
 * second insert for the same subject is the provider delivering its webhook again, and is answered as the fact it is
 * rather than thrown: the work is already on the ledger.
 */
export async function scheduleJobOnce(
  db: Db,
  scheduleParams: ScheduleParams,
): Promise<"scheduled" | "already_scheduled"> {
  const { error } = await insertJobOnce(db, rowToInsert(scheduleParams));
  if (!error) return "scheduled";
  if (error.code === "23505") return "already_scheduled";
  // The database's code travels with it: a caller tells a refusal (a kind the database does not know) from a write that
  // may have landed.
  throw Object.assign(new Error(`schedule_job: ${error.message}`), { code: error.code });
}

/**
 * Withdraw every scheduled job of a kind for one subject, in one statement.
 * A job already claimed is past withdrawing; from there the handler's own
 * checks are the guard (an outbound_send re-reads its message, and a canceled
 * message is not sent).
 */
export async function cancelJobsFor(
  db: Db,
  tenantId: TenantId,
  kind: JobKind,
  payloadKey: string,
  payloadValue: string,
): Promise<number> {
  // The key is concatenated into a PostgREST filter column, so it is held to a
  // plain JSON key: a metacharacter in it (a comma, a dot, a bracket) would
  // become a different filter — or an extra one — and widen the rows this
  // cancels, rather than failing.
  if (!/^[a-z][a-z0-9_]*$/.test(payloadKey)) throw new Error(`cancel_jobs_for: ${payloadKey} is not a payload key`);
  const { data, error } = await cancelScheduledJobs(db, { tenantId, kind, payloadKey, payloadValue });
  if (error) {
    logger().error("cancel_jobs_failed", { tenant_id: tenantId, kind, error: error.message });
    return 0;
  }
  return data?.length ?? 0;
}

/** What a requeue came to (requeueFailedJob). */
export type Requeued =
  | { outcome: "requeued"; kind: string }
  | { outcome: "not_found" }
  | { outcome: "not_failed"; state: string }
  | { outcome: "speaks_to_a_person"; kind: string }
  | { outcome: "redrive"; subscriber: string }
  | { outcome: "unknown_kind"; kind: string }
  | { outcome: "already_scheduled" };

/**
 * A failed job, run again: a fresh row of its kind and payload, due now, beside the failed one, which stays as the
 * record of what went wrong (kept 90 days, 00215). `failed` is final (jobs_guard), so the row is never moved back.
 * The back office's door, on the platform scope: `record` writes who asked, after the checks and before the row, and a
 * record that throws leaves nothing done. A kind that speaks to a person is never requeued: its failure may be a send
 * whose outcome nobody knows, and it goes again from its thread or its broadcast, where a person sees whether it left.
 * Nor is a job of any kind whose run said it was about to speak (spoke_at, ledger markSpoke): a text's answer that put
 * its words on the wire and then threw may have reached the customer, and a fresh row would answer them twice.
 * A job already run again (a copy that names it, `requeue_of`, not itself failed) answers `already_scheduled`, and so
 * does a kind the ledger holds once per subject when the subject is on the ledger again.
 * An event's delivery is not run again here: its row is the delivery's, which a fresh job would leave failed and naming
 * the old one, and its one way back is `event_deliveries_redrive` (00334, 00390), which replays every failed or paused
 * delivery of its subscriber once the subscriber is mended, each with a job of its own (decision 0031's review of
 * 9 October: one of the two re-drive paths goes).
 */
export async function requeueFailedJob(
  db: Db,
  tenantId: TenantId,
  jobId: string,
  record: (kind: string) => Promise<void>,
): Promise<Requeued> {
  const row = await readJobToRequeue(db, tenantId, jobId);
  if (!row) return { outcome: "not_found" };
  if (row.state !== "failed") return { outcome: "not_failed", state: row.state };
  if (row.kind === "event_deliver") {
    const subscriber = recordOrNull(row.payload)?.subscriber;
    return { outcome: "redrive", subscriber: typeof subscriber === "string" ? subscriber : "" };
  }
  if (SPEAKS_TO_A_PERSON.has(row.kind) || row.spoke_at) return { outcome: "speaks_to_a_person", kind: row.kind };
  // Run again once: a second press, or a second person, finds the copy the first left (it names the job it copies,
  // requeue_of) and does not make another; the copy's once-only key holds the same while it is live.
  if (await hasRequeuedCopy(db, tenantId, row.id)) return { outcome: "already_scheduled" };
  // A kind a newer deploy wrote and this one does not know (failed after a day unknown) waits for the deploy that does.
  const kind = JOB_KINDS.find((k) => k === row.kind);
  if (!kind) return { outcome: "unknown_kind", kind: row.kind };
  await record(kind);
  const payload = {
    ...(row.payload !== null && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {}),
    requeue_of: row.id,
  };
  const again = await scheduleJobOnce(db, { tenantId, kind, dueAt: new Date(), payload });
  return again === "scheduled" ? { outcome: "requeued", kind } : { outcome: "already_scheduled" };
}
