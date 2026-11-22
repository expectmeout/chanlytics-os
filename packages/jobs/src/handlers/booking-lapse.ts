/**
 * booking_lapse (decision 0061, as amended 22 Nov 2026): a time a customer asked for that ran out with no answer, closed
 * by core's settleLapsedRequest over the rows the database keeps and what the edge injects (the writer, ctx.drafts; the
 * reply setting in force, ctx.lapses). payload: { appointment_id }, which the watchdog's tick puts on the ledger once a
 * request while one waits (edge receptionist/request-clock.ts).
 *
 * It puts no words on a wire: the message is a queued row with its own send job, written by the door in the statement
 * that closes the request, so a run that died before the door sent nothing and closed nothing, and the next try starts
 * again. Its last try closes the request for a person rather than leave it open (core `lastTry`), and a run the ledger
 * gave up on is closed the same way (settle.ts).
 */
import { isAutomatedSend, slotShort, type RequestSaid, type TenantId } from "@chanlytics/contracts";
import { settleLapsedRequest, liveHoldOf, type ReplyDraftPorts, type RequestLapsePorts } from "@chanlytics/core";
import { replyDraftThreadOf } from "@chanlytics/db/ask";
import { closeLapsedRequest, findBookingRequest } from "@chanlytics/db/calendar";
import { listPersonRepliesAfter } from "@chanlytics/db/channels";
import { readLiveHold } from "@chanlytics/db/conversations";
import { logger } from "@chanlytics/log";
import { DbFailure } from "@chanlytics/contracts";
import type { BookingLapseEdge, ClaimedJob, JobContext } from "../runner/context";
import { MAX_ATTEMPTS, type Db } from "../runner/ledger";

/** How many of a conversation's replies are read for "a person spoke since": a campaign's sends among them are passed over. */
const REPLIES_READ = 10;

/** Whether a person typed a reply on the conversation after a moment, as the send door asks it of a draft (core deliver.ts). */
async function personSpokeSince(db: Db, tenantId: TenantId, conversationId: string, since: string): Promise<boolean> {
  const { data, error } = await listPersonRepliesAfter(db, {
    tenantId,
    conversationId,
    after: since,
    limit: REPLIES_READ,
  });
  if (error) throw new DbFailure(error, "booking_lapse: cannot read the conversation's replies");
  return data.some((m) => !isAutomatedSend(m.meta));
}

/** The verb's ports, over this database, the writer and the edge's reading of the reply setting. */
function requestLapsePortsOf(
  db: Db,
  edge: { write: ReplyDraftPorts["write"]["reply"]; posture: BookingLapseEdge["posture"] },
  now: () => number = Date.now,
): RequestLapsePorts {
  return {
    request: (tenantId, appointmentId) => findBookingRequest(db, tenantId, appointmentId),
    thread: async (tenantId, conversationId, since) => {
      const [thread, hold, personSpoke] = await Promise.all([
        replyDraftThreadOf(db, tenantId, conversationId),
        readLiveHold(db, tenantId, conversationId),
        personSpokeSince(db, tenantId, conversationId, since),
      ]);
      if (!thread) return null;
      const control = liveHoldOf(hold ?? {});
      return {
        holdReason: thread.holdReason,
        wire: thread.wire,
        clocks: thread.clocks,
        optedOut: thread.optedOut,
        forMessageId: thread.forMessageId,
        theirWords: thread.theirWords,
        // The message they asked in was written before its request; one written after it is them writing again.
        wroteAgain: !!thread.theirAt && Date.parse(thread.theirAt) > Date.parse(since),
        personSpoke,
        liveHold: !!control && now() < Date.parse(control.until),
      };
    },
    posture: edge.posture,
    write: edge.write,
    lapse: (cmd) => closeLapsedRequest(db, cmd),
  };
}

export async function runBookingLapse(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  const { drafts, lapses } = ctx;
  if (!drafts || !lapses) throw new Error("booking_lapse: this runtime holds no writer for a request that ran out");
  const appointmentId = typeof job.payload.appointment_id === "string" ? job.payload.appointment_id : "";
  const outcome = await settleLapsedRequest(
    requestLapsePortsOf(ctx.db, {
      write: (tenantId, ask) => drafts.write.reply(tenantId, ask),
      posture: (tenantId, contactId) => lapses.posture(tenantId, contactId),
    }),
    {
      tenantId: job.tenant_id,
      appointmentId,
      now: new Date(),
      deadline: ctx.deadline,
      lastTry: (job.attempts ?? 1) >= MAX_ATTEMPTS,
    },
  );
  logger().info("booking_lapse_job", { tenant_id: job.tenant_id, job: job.id, appointment: appointmentId, outcome });
  // Answered, replaced, gone or not yet run out: there was nothing of this job's to close.
  if (outcome === "answered" || outcome === "gone" || outcome === "early") return { skipped: outcome };
}

/**
 * A request that ran out, as its owner's note says it (core visit_notice): who asked, for when on the business's clock,
 * and its conversation. Null where the record no longer holds it, or it has no conversation to open.
 */
export async function readLapsedRequest(
  db: Db,
  tenantId: TenantId,
  appointmentId: string,
): Promise<RequestSaid | null> {
  const row = await findBookingRequest(db, tenantId, appointmentId);
  if (!row?.conversationId) return null;
  return {
    appointmentId: row.id,
    conversationId: row.conversationId,
    who: row.who,
    when: slotShort(Date.parse(row.startsAt), row.timezone),
    service: row.service,
  };
}
