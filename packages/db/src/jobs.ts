/**
 * Rows of the jobs ledger, read for the back office's requeue door (packages/jobs requeueFailedJob). The ledger's own
 * writes (claim, complete, fail, defer, schedule) are packages/jobs' and name the table there; these are the two reads a
 * requeue makes, each in the workspace it is asked for, so a job of another workspace is not found. And the one door
 * that writes a broadcast, its people, its send job and its decision together (assembleBroadcast), the one that approves a run that
 * waited (approveBroadcast), and what a send job writes on the queued message it names: its claim before the wire
 * (claimQueuedSend, releaseQueuedSend) and the failure a run that did not finish leaves on it (failQueuedSend).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";

type Db = SupabaseClient<Database>;

/**
 * What a requeue needs of a job: what it was, how it ended, what it carried, when it was made, and whether a run of it
 * put words on a wire (jobs.spoke_at, 00352; null when none did, and on a database 00352 has not reached).
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
  // A database 00352 has not reached keeps no such fact, and no job there said it spoke: read without it.
  if (error && NO_SUCH_COLUMN.has(error.code)) {
    const older = await db
      .from("jobs")
      .select("id, kind, state, payload, created_at")
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (older.error) throw new Error(`read_job: ${older.error.message}`);
    return older.data ? { ...older.data, spoke_at: null } : null;
  }
  if (error) throw new Error(`read_job: ${error.message}`);
  return data;
}

/**
 * Whether the ledger already holds a copy of this job made after it: the same kind and payload, in this workspace,
 * not itself failed. A dead letter run again leaves that copy behind, so a second press (or a second person) finds it
 * and does not run the work twice.
 */
export async function hasNewerCopy(db: Db, tenantId: string, job: JobToRequeue): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", job.kind)
    .filter("payload", "eq", JSON.stringify(job.payload))
    .neq("state", "failed")
    .gt("created_at", job.created_at)
    .limit(1);
  if (error) throw new Error(`read_job_copies: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Whose decision a run's send is, and what the ledger keeps of it: a member's (`actor`) or the system's (null, the sweep's). */
export interface AssembleDecision {
  actor: string | null;
  payload: Json;
  via: string | null;
  undoOf: string | null;
}

/**
 * A broadcast, its people, its send job and the send_broadcast decision on it, written whole (00378 assemble_broadcast,
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

/** PostgREST's answers for a column the database does not hold yet: none of that name in its schema, or in the table. */
const NO_SUCH_COLUMN: ReadonlySet<string> = new Set(["PGRST204", "42703"]);

/**
 * A queued message claimed by the one run that takes it to the wire (messages.sending_at, 00352): true when this run
 * holds it now. False when another run claimed it first, or the row is no longer queued (canceled, sent, failed):
 * either way this run sends nothing. One statement, so two jobs naming one message are never both answered yes.
 * Throws when the write failed: "could not claim" is not a yes. A database 00352 has not reached holds no such column
 * and answers true, so the send goes as it did before it and the two may land in either order.
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
  if (error && NO_SUCH_COLUMN.has(error.code)) return true;
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
  if (error && !NO_SUCH_COLUMN.has(error.code)) throw new Error(`release_queued_send: ${error.message}`);
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
