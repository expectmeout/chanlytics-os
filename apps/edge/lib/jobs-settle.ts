/**
 * What a job leaves behind when it will not run.
 *
 * The ledger row is only half the truth. A job that reaches a terminal state
 * was in the middle of something, and until this module existed each of the
 * sweep's two terminal paths settled exactly the half the other ignored: the
 * `fired` reap marked a stuck outbound_send's message failed and left the
 * broadcast alone, and the overdue give-up released the broadcast and left the
 * message alone. So an outbound_send given up on said "Sending…" for ever, and
 * a broadcast whose lambda died sat in 'sending' with half its recipients
 * reached and nothing coming. Two half-settlements are not one settlement.
 *
 * `certain` says whether the work provably never happened: a job nothing ever
 * claimed is certain, one claimed and never heard from again is not. It changes
 * the words recorded, never the conditions — every write here is conditional on
 * the downstream row still claiming to be in flight, so a handler that DID
 * record its send before dying is left exactly as it left it either way. That
 * condition, not `certain`, is what makes this safe to run on a job whose
 * outcome is unknown.
 *
 * Only the two kinds that leave something behind are here. `pause_expire` needs
 * nothing: expire_stale_pauses() (00006) has reopened any conversation whose
 * pause ran out, whoever set it, every fifteen minutes since. `snooze_wake` is
 * the same shape of gap and gets the same shape of answer — a sweeper of its
 * own (00082) — because a snooze is stranded by a job that never ran for any
 * reason, not only by this sweep giving up on it.
 */
import type { pg } from "./pg.js";

type Db = NonNullable<ReturnType<typeof pg>>;

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
export async function settle(db: Db, job: TerminalJob, certain: boolean): Promise<Settled[]> {
  const reason = certain ? "never_delivered" : "run_interrupted";

  if (job.kind === "outbound_send") {
    const messageId = idFrom(job.payload, "message_id");
    if (!messageId) return [{ what: "message", changed: false, error: "no message_id on the job" }];
    // Conditional on 'queued': if the handler did record the send before dying,
    // that row is already 'sent', and saying otherwise would be a lie about a
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

  return [];
}

/**
 * The sentence an owner reads about the wreckage, or null when there is none.
 *
 * The give-up alert used to state flatly that the broadcast had been marked
 * failed, whether or not the write had found anything to mark — and
 * releaseBroadcast discarded its own error, so "whether or not" included
 * "whether or not it worked". The words are built from what the writes actually
 * returned, which is the only version an owner can act on.
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
