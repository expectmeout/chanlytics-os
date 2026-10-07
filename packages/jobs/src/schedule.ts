/**
 * Scheduling is one insert. The heartbeat (api/jobs/tick.ts, over
 * claim_due_jobs) runs whatever is due, so there is no second system to tell,
 * no publish that can be lost after the row is written, and no orphan to clean
 * up. Service-role territory (§8): never called with a session client.
 *
 * A job scheduled while a request is being served carries that request's name
 * in its payload (`request_id`), and the tick runs the job under it: a click's
 * reply, the send it queued and the send's lines are one search in the log. A
 * payload that names one already keeps it, so a job a job schedules (a
 * broadcast's next batch) carries the request that started the chain.
 */
import { hasNewerCopy, readJobToRequeue, type Json } from "@chanlytics/db";
import { JOB_KINDS, type JobKind } from "@chanlytics/contracts";
import { logger, requestId } from "@chanlytics/channels";
import { SPEAKS_TO_A_PERSON, type Db } from "./ledger";

/** The payload with the request it was scheduled in, when there is one and it does not name one already. */
function named(payload: Json): Json {
  const id = requestId();
  if (!id || payload === null || typeof payload !== "object" || Array.isArray(payload) || "request_id" in payload)
    return payload;
  return { ...payload, request_id: id };
}

export interface ScheduleParams {
  tenantId: string;
  kind: JobKind;
  dueAt: Date;
  payload: Json;
}

/**
 * What makes a row once-only while it is scheduled or fired (jobs.dedupe_key, 00333, decision 0033): the three kinds the
 * ledger held once per subject by an index of their own carry the same subject as their key, so one index holds every
 * kind once the three retire. A text's answer (inbound_answer, 00347) is held once per message the same way. A kind with
 * no rule has no key.
 */
function dedupeKeyOf(kind: JobKind, payload: Json): string | null {
  const p = payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const field = (name: string): string | null => (typeof p[name] === "string" ? p[name] : null);
  switch (kind) {
    case "email_ingest":
      return field("mailbox_id") && field("received_id")
        ? `email_ingest:${field("mailbox_id")}:${field("received_id")}`
        : null;
    case "lead_collect":
      return field("run_id") && field("seq") ? `lead_collect:${field("run_id")}:${field("seq")}` : null;
    case "reply_read":
      return field("message_id") ? `reply_read:${field("message_id")}:${field("stage") ?? "read"}` : null;
    // One read per delivery (docs/plans/2026-10-07-bookings-arrive-by-email.md): the intake run again, or the
    // provider's webhook replayed, finds the read already on the ledger.
    case "booking_read":
      return field("received_id") ? `booking_read:${field("received_id")}` : null;
    case "inbound_answer":
      return field("message_id") ? `inbound_answer:${field("message_id")}` : null;
    default:
      return null;
  }
}

/** The row an insert writes: the key beside the payload where the kind has one. */
function rowToInsert(p: ScheduleParams, key: string | null) {
  return {
    tenant_id: p.tenantId,
    kind: p.kind,
    due_at: p.dueAt.toISOString(),
    payload: named(p.payload),
    ...(key ? { dedupe_key: key } : {}),
  };
}

export async function scheduleJob(db: Db, p: ScheduleParams): Promise<{ jobId: string }> {
  const { data, error } = await db
    .from("jobs")
    .insert({ tenant_id: p.tenantId, kind: p.kind, due_at: p.dueAt.toISOString(), payload: named(p.payload) })
    .select("id")
    .single();
  if (error || !data) throw new Error(`schedule_job: ${error?.message ?? "no row"}`);
  return { jobId: data.id };
}

/**
 * The same insert, for a kind the ledger holds at most one of per subject (a
 * unique index on its payload: email_ingest, 00127). A second insert for the
 * same subject is the provider delivering its webhook again, and is answered
 * as the fact it is rather than thrown: the work is already on the ledger.
 */
export async function scheduleJobOnce(db: Db, p: ScheduleParams): Promise<"scheduled" | "already_scheduled"> {
  const key = dedupeKeyOf(p.kind, p.payload);
  const insert = (dedupeKey: string | null) => db.from("jobs").insert(rowToInsert(p, dedupeKey));
  let { error } = await insert(key);
  // A database 00333 has not reached has no dedupe_key column (PostgREST: PGRST204): the row is written without the
  // key, held once by the kind's own index as before, so the edge and the migration may land in either order.
  if (error?.code === "PGRST204" && key) ({ error } = await insert(null));
  if (!error) return "scheduled";
  if (error.code === "23505") return "already_scheduled";
  throw new Error(`schedule_job: ${error.message}`);
}

/**
 * Withdraw every scheduled job of a kind for one subject, in one statement.
 * A job already claimed is past withdrawing; from there the handler's own
 * checks are the guard (an outbound_send re-reads its message, and a canceled
 * message is not sent).
 */
export async function cancelJobsFor(
  db: Db,
  tenantId: string,
  kind: JobKind,
  payloadKey: string,
  payloadValue: string,
): Promise<number> {
  // The key is concatenated into a PostgREST filter column, so it is held to a
  // plain JSON key: a metacharacter in it (a comma, a dot, a bracket) would
  // become a different filter — or an extra one — and widen the rows this
  // cancels, rather than failing.
  if (!/^[a-z][a-z0-9_]*$/.test(payloadKey)) throw new Error(`cancel_jobs_for: ${payloadKey} is not a payload key`);
  const { data, error } = await db
    .from("jobs")
    .update({ state: "canceled" })
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("state", "scheduled")
    .eq(`payload->>${payloadKey}`, payloadValue)
    .select("id");
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
  | { outcome: "unknown_kind"; kind: string }
  | { outcome: "already_scheduled" };

/**
 * A failed job, run again: a fresh row of its kind and payload, due now, beside the failed one, which stays as the
 * record of what went wrong (kept 90 days, 00215). `failed` is final (jobs_guard), so the row is never moved back.
 * The back office's door, on the platform scope: `record` writes who asked, after the checks and before the row, and a
 * record that throws leaves nothing done. A kind that speaks to a person is never requeued: its failure may be a send
 * whose outcome nobody knows, and it goes again from its thread or its broadcast, where a person sees whether it left.
 * A job already run again (a copy of its kind and payload made after it, not itself failed) answers
 * `already_scheduled`, and so does a kind the ledger holds once per subject when the subject is on the ledger again.
 */
export async function requeueFailedJob(
  db: Db,
  tenantId: string,
  jobId: string,
  record: (kind: string) => Promise<void>,
): Promise<Requeued> {
  const row = await readJobToRequeue(db, tenantId, jobId);
  if (!row) return { outcome: "not_found" };
  if (row.state !== "failed") return { outcome: "not_failed", state: row.state };
  if (SPEAKS_TO_A_PERSON.has(row.kind)) return { outcome: "speaks_to_a_person", kind: row.kind };
  // Run again once: a second press, or a second person, finds the copy the first left and does not make another.
  if (await hasNewerCopy(db, tenantId, row)) return { outcome: "already_scheduled" };
  // A kind a newer deploy wrote and this one does not know (failed after a day unknown) waits for the deploy that does.
  const kind = JOB_KINDS.find((k) => k === row.kind);
  if (!kind) return { outcome: "unknown_kind", kind: row.kind };
  await record(kind);
  const again = await scheduleJobOnce(db, { tenantId, kind, dueAt: new Date(), payload: row.payload });
  return again === "scheduled" ? { outcome: "requeued", kind } : { outcome: "already_scheduled" };
}
