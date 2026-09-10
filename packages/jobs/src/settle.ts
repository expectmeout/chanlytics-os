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
import type { Db } from "./ledger";

export interface TerminalJob {
  id: string;
  kind: string;
  tenant_id: string;
  payload: unknown;
}

/** One thing a job was in the middle of, and what became of it. */
export interface Settled {
  /** The kind of row, in the words the product uses for it. */
  what: "message" | "broadcast";
  /** True only when a row was found still in flight and marked failed. */
  changed: boolean;
  /** Why nothing could be written, when nothing could be. Never swallowed. */
  error?: string;
}

/**
 * What the MESSAGE row says, which is not what the job row says. The job's
 * last_error explains the job; a person reading the conversation is owed a
 * sentence about their message.
 */
const NEVER_SENT = "the job that would have sent this never ran";
const MAY_HAVE_SENT = "the run that was sending this did not finish";

function idFrom(payload: unknown, key: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

/**
 * Settle what this job was in the middle of. Never throws: a settlement that
 * cannot be written is reported in its own row, because the caller's job is to
 * tell an owner the truth and "we could not check" is part of the truth.
 */
export async function settleJob(db: Db, job: TerminalJob, certain: boolean): Promise<Settled[]> {
  const reason = certain ? "never_delivered" : "run_interrupted";

  if (job.kind === "outbound_send") {
    const messageId = idFrom(job.payload, "message_id");
    if (!messageId) return [{ what: "message", changed: false, error: "no message_id on the job" }];
    // Conditional on 'queued': if the handler did record the send before dying,
    // that row already says 'sent', and saying otherwise would be a lie about a
    // message that reached a real person. Only a row still claiming to be on
    // its way is touched.
    const { data, error } = await db
      .from("messages")
      .update({ status: "failed", error: { reason, note: certain ? NEVER_SENT : MAY_HAVE_SENT } })
      .eq("id", messageId)
      .eq("tenant_id", job.tenant_id)
      .eq("status", "queued")
      .select("id");
    return [{ what: "message", changed: !!data?.length, ...(error ? { error: error.message } : {}) }];
  }

  if (job.kind === "broadcast_send") {
    const broadcastId = idFrom(job.payload, "broadcast_id");
    if (!broadcastId) return [{ what: "broadcast", changed: false, error: "no broadcast_id on the job" }];
    // broadcastSend schedules its own next batch, so one lost link strands the
    // whole run. Conditional on 'sending', so a broadcast that finished between
    // the read and here is left exactly as it finished.
    const { data, error } = await db
      .from("broadcasts")
      .update({ state: "failed", finished_at: new Date().toISOString() })
      .eq("id", broadcastId)
      .eq("tenant_id", job.tenant_id)
      .eq("state", "sending")
      .select("id");
    return [{ what: "broadcast", changed: !!data?.length, ...(error ? { error: error.message } : {}) }];
  }

  // blob_thread_erase leaves nothing behind that says it is still going: the
  // stored copy either went or did not, and the erasure's own retry handle is
  // the job's unscrubbed payload (see rescheduleBlobErase in the dashboard).
  return [];
}

/**
 * The sentence an owner reads about the wreckage, or null when there is none.
 * Built from what the writes actually returned, which is the only version an
 * owner can act on.
 */
export function saySettled(results: Settled[]): string | null {
  const lines: string[] = [];
  for (const r of results) {
    if (r.error) {
      lines.push(r.what === "message"
        ? `The message it was sending could not be updated (${r.error}), so it may still show as sending.`
        : `The broadcast could not be updated (${r.error}), so it may still show as sending.`);
    } else if (r.changed) {
      lines.push(r.what === "message"
        ? "The message has been marked failed, so it is no longer shown as on its way."
        : "The broadcast has been marked failed; the people it had already reached still got it.");
    }
    // changed:false with no error means the row had already moved on by itself.
    // There is nothing to tell anyone about work that completed.
  }
  return lines.length ? lines.join(" ") : null;
}
