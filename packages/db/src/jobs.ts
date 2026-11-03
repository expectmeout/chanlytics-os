/**
 * Rows of the jobs ledger, read for the back office's requeue door (packages/jobs requeueFailedJob). The ledger's own
 * writes (claim, complete, fail, defer, schedule) are packages/jobs' and name the table there; these are the reads a
 * requeue makes, each in the workspace it is asked for, so a job of another workspace is not found, and the failed jobs
 * of a kind the Console runs again together. A queued reply written with its job (queueSend). And the one door
 * that writes a broadcast, its people, its send job and its decision together (assembleBroadcast), the one that approves a run that
 * waited (approveBroadcast), and what a send job writes on the queued message it names: its claim before the wire
 * (claimQueuedSend, releaseQueuedSend) and the failure a run that did not finish leaves on it (failQueuedSend).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";

type Db = SupabaseClient<Database>;

/**
 * What a requeue needs of a job: what it was, how it ended, what it carried, when it was made, and whether a run of it
 * put words on a wire (jobs.spoke_at, 00352; null when none did).
 */
export interface JobToRequeue {
  id: string;
  kind: string;
  state: string;
  payload: Json;
  created_at: string;
  spoke_at: string | null;
}

/** The job with this id in this workspace, or null when there is none. */
export async function readJobToRequeue(db: Db, tenantId: string, jobId: string): Promise<JobToRequeue | null> {
  const { data, error } = await db
    .from("jobs")
    .select("id, kind, state, payload, created_at, spoke_at")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`read_job: ${error.message}`);
  return data;
}

/**
 * Whether the ledger already holds a copy of this failed job that is not itself failed: the copy names the job it is a
 * copy of (payload.requeue_of, 00515), so a second press, or a second person, finds it and does not run the work twice.
 * It used to be found by its payload's equality with the failed one's, which a copy made inside a request never had: the
 * request's name rode on its payload.
 */
export async function hasRequeuedCopy(db: Db, tenantId: string, jobId: string): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("payload->>requeue_of", jobId)
    .neq("state", "failed")
    .limit(1);
  if (error) throw new Error(`read_job_copies: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** The jobs of one kind that failed for good since a moment, oldest first: what the Console runs again together. */
export async function failedJobsOfKind(
  db: Db,
  q: { kind: string; sinceIso: string; limit: number },
): Promise<{ id: string; tenant_id: string }[]> {
  const { data, error } = await db
    .from("jobs")
    .select("id, tenant_id")
    .eq("kind", q.kind)
    .eq("state", "failed")
    .gte("updated_at", q.sinceIso)
    .order("updated_at", { ascending: true })
    .limit(q.limit);
  if (error) throw new Error(`read_failed_jobs: ${error.message}`);
  return data ?? [];
}

/** Whose decision a run's send is, and what the ledger keeps of it: a member's (`actor`) or the system's (null, the sweep's). */
export interface AssembleDecision {
  actor: string | null;
  payload: Json;
  via: string | null;
  undoOf: string | null;
}

/**
 * A broadcast, its people, its send job and the send_broadcast decision on it, written whole (00381 assemble_broadcast,
 * over 00282's door): the run's id back with the decision's, or a throw and then nothing was written. The function puts
 * the job on the ledger, which no session may, so it is the service role's alone; each caller has checked who may ask
 * (the dashboard's route after its role check, the playbooks sweep), and the function asks for itself that every
 * person, the template and the playbook are the workspace's. `run` is the run's own columns (core's NewBroadcast),
 * `recipients` its people with the words their row keeps, `sendAt` when the job is due (none, and no job is written),
 * and `decision` whose decision the send is and what the ledger keeps of it: none for a run that waits for a person,
 * whose approval is its decision (approveBroadcast), and then `decisionId` is null. `undoDropped` says the undo link
 * named a decision this database does not hold, and the run stands without it.
 */
export async function assembleBroadcast(
  db: Db,
  args: { tenantId: string; run: Json; recipients: Json; sendAt: Date | null; decision: AssembleDecision | null },
): Promise<{ id: string; decisionId: string | null; undoDropped: boolean }> {
  const { decision } = args;
  const { data, error } = await db.rpc("assemble_broadcast", {
    p_tenant: args.tenantId,
    p_run: args.run,
    p_recipients: args.recipients,
    p_decision: decision?.payload ?? null,
    ...(args.sendAt ? { p_send_at: args.sendAt.toISOString() } : {}),
    ...(decision?.actor ? { p_actor: decision.actor } : {}),
    ...(decision?.via ? { p_via: decision.via } : {}),
    ...(decision?.undoOf ? { p_undo_of: decision.undoOf } : {}),
  });
  if (error) throw new Error(error.message);
  if (data === null || typeof data !== "object" || Array.isArray(data) || typeof data.id !== "string")
    throw new Error("broadcast not created");
  const decisionId = typeof data.decision_id === "string" ? data.decision_id : null;
  if (decision && decisionId === null) throw new Error("assemble_broadcast: the door answered without its decision");
  return { id: data.id, decisionId, undoDropped: data.undo_dropped === true };
}

/**
 * A queued message claimed by the one run that takes it to the wire (messages.sending_at, 00352): true when this run
 * holds it now. False when another run claimed it first, or the row is no longer queued (canceled, sent, failed):
 * either way this run sends nothing. One statement, so two jobs naming one message are never both answered yes.
 * Throws when the write failed: "could not claim" is not a yes.
 */
export async function claimQueuedSend(db: Db, tenantId: string, messageId: string): Promise<boolean> {
  const { data, error } = await db
    .from("messages")
    .update({ sending_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .eq("status", "queued")
    .is("sending_at", null)
    .select("id");
  if (error) throw new Error(`claim_queued_send: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * The claim given back, while the row is still queued: the provider provably did not take the message (its "not now",
 * a wire that could not be bound), so the fresh job that follows may claim it. Throws when the write failed, and the
 * caller then asks for no fresh job: a claim that could not be given back is a row nobody may send, and the ledger
 * settles it as a send that did not finish.
 */
export async function releaseQueuedSend(db: Db, tenantId: string, messageId: string): Promise<void> {
  const { error } = await db
    .from("messages")
    .update({ sending_at: null })
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .eq("status", "queued");
  if (error) throw new Error(`release_queued_send: ${error.message}`);
}

/**
 * A run that waits for a person, approved whole (00353 approve_broadcast), on the member's own session: the run
 * released to scheduled for `sendAt`, its send job written when `job` is given (what rides in its payload beside the
 * run's id; null for a reach-out's run, which has none), and the approval recorded as the member's. The decision's id
 * with whether an undo link it named was dropped; null when the run was no longer waiting, and then nothing was
 * written. Throws when the door refused or failed, and then nothing was written either.
 */
export async function approveBroadcast(
  db: Db,
  args: {
    tenantId: string;
    broadcastId: string;
    sendAt: Date;
    job: Json | null;
    decision: Json;
    via: string | null;
    undoOf: string | null;
  },
): Promise<{ decisionId: string; undoDropped: boolean } | null> {
  const { data, error } = await db.rpc("approve_broadcast", {
    p_tenant_id: args.tenantId,
    p_broadcast_id: args.broadcastId,
    p_send_at: args.sendAt.toISOString(),
    p_job: args.job,
    p_decision: args.decision,
    ...(args.via ? { p_via: args.via } : {}),
    ...(args.undoOf ? { p_undo_of: args.undoOf } : {}),
  });
  if (error) throw new Error(`approve_broadcast: ${error.message}`);
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const id = data.decision_id;
  if (typeof id !== "string") throw new Error("approve_broadcast: the door answered without its decision");
  return { decisionId: id, undoDropped: data.undo_dropped === true };
}

/** What the ledger reads back of a message it failed: where to flag, whose words they were, and whether a campaign's email. */
interface FailedQueuedSend {
  conversation_id: string | null;
  sender: string | null;
  channel: string | null;
  meta: { email?: { request?: unknown } } | null;
}

/**
 * A queued message marked failed with why, for a send job that did not finish (jobs settleJob). Only a row still
 * `queued`: one its run did record as sent is left as it is, since saying otherwise would be a lie about a message
 * that reached a person. The row when one was changed, null when none was (already sent, canceled, or gone). Never
 * throws: a write that failed comes back as its error, because the caller's job is to tell an owner what it knows, and
 * "could not write it" is part of that.
 */
export async function failQueuedSend(
  db: Db,
  p: { tenantId: string; messageId: string; error: Json },
): Promise<{ row: FailedQueuedSend | null; error: string | null }> {
  const { data, error } = await db
    .from("messages")
    .update({ status: "failed", error: p.error })
    .eq("id", p.messageId)
    .eq("tenant_id", p.tenantId)
    .eq("status", "queued")
    .select("conversation_id, sender, channel, meta");
  if (error) return { row: null, error: error.message };
  const row = data?.[0];
  if (!row) return { row: null, error: null };
  const meta = row.meta !== null && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : null;
  const email = meta?.email;
  const request = email !== null && typeof email === "object" && !Array.isArray(email) ? email.request : undefined;
  return {
    row: {
      conversation_id: row.conversation_id,
      sender: row.sender,
      channel: row.channel,
      meta: request === undefined ? null : { email: { request } },
    },
    error: null,
  };
}

/**
 * A queued reply and its outbound_send job, written together or not at all (00516 queue_send): the receptionist's held
 * draft used to be written, then its job, and a run killed between the two left a reply nothing would send. The address
 * is frozen on the row (meta.to), where the send reads it first. Answers the message's id; throws when nothing was
 * written.
 */
export async function queueSend(
  db: Db,
  q: {
    tenantId: string;
    conversationId: string;
    contactId: string | null;
    channel: "whatsapp" | "sms" | "instagram";
    sender: "ai" | "human" | "system";
    body: string;
    meta: Json;
    dueAt: Date;
    /** The job's payload past its message: its address for an older edge, and its purpose; never the words. */
    payload: Json;
  },
): Promise<string> {
  const { data, error } = await db.rpc("queue_send", {
    p_message: {
      tenant_id: q.tenantId,
      conversation_id: q.conversationId,
      contact_id: q.contactId,
      channel: q.channel,
      sender: q.sender,
      type: "text",
      body: q.body,
      meta: q.meta,
    },
    p_due_at: q.dueAt.toISOString(),
    p_payload: q.payload,
  });
  if (error || typeof data !== "string") throw new Error(`queue_send: ${error?.message ?? "no message"}`);
  return data;
}

/** The kinds an operator paused (job_kinds.paused_at, 00515), with since when and why: the health sweep pages each. */
export async function pausedJobKinds(
  db: Db,
): Promise<{ kind: string; paused_at: string; paused_why: string | null }[]> {
  const { data, error } = await db.from("job_kinds").select("kind, paused_at, paused_why").not("paused_at", "is", null);
  if (error) throw new Error(`read_paused_kinds: ${error.message}`);
  return (data ?? []).flatMap((k) =>
    k.paused_at ? [{ kind: k.kind, paused_at: k.paused_at, paused_why: k.paused_why }] : [],
  );
}
