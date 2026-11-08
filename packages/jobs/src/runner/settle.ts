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
 * runner knows is certain, and so is one that threw saying so (core
 * CertainFailure: a reply whose wire could not be bound, or that the provider
 * did not take, for every fresh job it was given; `why` is its own words for
 * the row); one that ran and threw otherwise, or ran and never came back, is
 * not. It changes the words recorded, never the conditions. Every write here
 * is conditional on the downstream row still claiming to be in flight, so a
 * handler that DID record its send before dying is left exactly as it left it
 * either way. That condition, not `certain`, is what makes this safe to run on
 * a job whose outcome is unknown.
 */
import {
  IMPORT_SOURCES,
  IMPORT_STOPPED_WORDS,
  isOneOf,
  REPLY_DRAFT_KINDS,
  PER_MAILBOX_SOURCES,
  isCampaignEmail,
  type ImportSource,
  type JobKind,
  FILE_LOOK_EDITION,
  VIDEO_LOOK_EDITION,
  type SchemaSet,
  entryOf,
  recordOrEmpty,
} from "@chanlytics/contracts";
import { logger } from "@chanlytics/log";
import { recordConversationDraftFailed } from "@chanlytics/db/ask";
import { emitEvent, failOpenDelivery } from "@chanlytics/db/events";
import { failQueuedSend } from "@chanlytics/db/jobs";
import { keepFileLook } from "@chanlytics/db/files";
import { holdNoticeIfUnkept } from "@chanlytics/db/calendar";
import { noteImport } from "@chanlytics/db/imports";
import {
  countBroadcastSends,
  failInterruptedBroadcast,
  findBroadcastState,
  recordPreviewBuilt,
} from "@chanlytics/db/campaigns";
import { findEmailThreadOf, markMailboxIntakeFailed } from "@chanlytics/db/email";
import { countLiveBroadcastJobs } from "@chanlytics/db/jobs";
import { carriedBy, nextBatch } from "./batch-carry";
import { upsertEscalation, type EscalationOutcome } from "./escalate";
import { MAX_RESUMES, RUN_INTERRUPTED, type Db } from "./ledger";
import { scheduleJob } from "./schedule";
import type { TenantId } from "@chanlytics/contracts";

export interface TerminalJob {
  id: string;
  kind: string;
  tenant_id: TenantId;
  payload: unknown;
}

/** One thing a job was in the middle of, and what became of it. */
export interface Settled {
  /** The kind of row, in the words the product uses for it. */
  what: "message" | "broadcast" | "email" | "preview" | "import" | "notice" | "delivery" | "file" | "draft";
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
 * What the MESSAGE row says, which is not what the job row says. The job's
 * last_error explains the job; a person reading the conversation is owed a
 * sentence about their message.
 */
const NEVER_SENT = "the job that would have sent this never ran";

/** What the thread says when the intake died: the email is here, and it is a person’s. */
const EMAIL_UNFINISHED =
  "An email arrived and could not be taken in: it did not finish being filed, and no reply was drafted. Read it here and reply from the Inbox.";
const MAY_HAVE_SENT = "the run that was sending this did not finish";

/**
 * What the row and the thread's flag say of a send: a failure that said why it is certain, in its own words (core
 * CertainFailure's `why`); a job that never ran, in the ledger's; a run that died, in the words for one that may have sent.
 */
const noteOf = (certain: boolean, reason?: string): string => (certain ? (reason ?? NEVER_SENT) : MAY_HAVE_SENT);

/**
 * What the MAILBOX carries after an intake died, which is a different reader
 * from the thread's. It is shown on Connections and Setup, so it is a sentence
 * for the owner and never a provider's error text: the reason the job failed
 * is on the job, where a person at Chanlytics reads it. The next email that is
 * taken in clears it (db stampMailboxReceived), so it says what is true now.
 */
const MAILBOX_INTAKE_FAILED = "An email could not be taken in. Anything since then is in your Inbox as usual.";

function idFrom(payload: unknown, key: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

/**
 * The workspace's mailbox says its last intake failed.
 *
 * Best effort by design, and deliberately not fatal: the thread's hold is the
 * durable half of a dead intake, and a mailbox row that could not be marked
 * must never cost a customer that. A job carrying no mailbox_id is not one
 * this can speak for.
 */
async function noteMailboxTrouble(
  db: Db,
  tenantId: TenantId,
  mailboxId: string | null,
): Promise<{ mailbox?: "marked" | "gone" | "failed" }> {
  if (!mailboxId) return {};
  // The rows are COUNTED. An update that matched nothing comes back without an
  // error -- a mailbox deleted since the webhook, or one that is not this
  // workspace's -- and reporting that as a mark would be this file telling the
  // same kind of lie it exists to stop.
  const { data, error } = await markMailboxIntakeFailed(db, { tenantId, mailboxId, lastError: MAILBOX_INTAKE_FAILED });
  if (error) {
    logger().error("mailbox_trouble_not_marked", { tenant_id: tenantId, mailbox_id: mailboxId, error: error.message });
    return { mailbox: "failed" };
  }
  return { mailbox: data && data.length > 0 ? "marked" : "gone" };
}

/** How many fresh runs this job is already the result of. Absent reads as none. */
function resumesOf(payload: unknown): number {
  if (typeof payload !== "object" || payload === null) return 0;
  const v = recordOrEmpty(payload).resumes;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * How far a broadcast got: COUNTED, not tallied from a page of rows. PostgREST
 * caps a plain select at max_rows, so reading the rows to count them tells the
 * owner "0 reached, 0 to go" when the read fails and understates both numbers
 * on any broadcast bigger than the cap — on the one screen where those two
 * numbers are the whole point.
 */
async function howFar(
  db: Db,
  tenantId: TenantId,
  broadcastId: string,
): Promise<{ reached: number; remaining: number; error?: string }> {
  const of = (state: SchemaSet<"sequence_sends.state">) =>
    countBroadcastSends(db, { tenantId, broadcastId }, { state });
  const [sent, queued] = await Promise.all([of("sent"), of("queued")]);
  const error = sent.error?.message ?? queued.error?.message;
  return { reached: sent.count ?? 0, remaining: queued.count ?? 0, ...(error ? { error } : {}) };
}

/**
 * The honest failure, when no fresh run will carry the broadcast. `failure` is
 * written too: the column is on the broadcast's own page, and "Failed" with no
 * reason beside it reads the same as a template Meta rejected.
 */
async function failBroadcast(
  db: Db,
  job: TerminalJob,
  broadcastId: string,
  reason: string,
  far: { reached: number; remaining: number },
): Promise<Settled[]> {
  const { data, error } = await failInterruptedBroadcast(
    db,
    { tenantId: job.tenant_id, broadcastId },
    new Date().toISOString(),
  );
  if (error) return [{ what: "broadcast", changed: false, ...far, error: `${reason}; then ${error.message}` }];
  // No row means it finished by itself between the read and here, and there is
  // nothing to tell anyone about work that completed.
  if (!data?.length) return [{ what: "broadcast", changed: false, ...far }];
  // On the ledger as every stopped run is (broadcast.stopped), best effort: never a reason this settlement throws.
  await emitEvent(db, job.tenant_id, "broadcast.stopped", "broadcast", broadcastId, {
    failure: "run_interrupted",
    sent: far.reached,
  });
  return [{ what: "broadcast", changed: true, notResumed: reason, ...far }];
}

/** A reply's send: the message still claiming to be on its way is marked failed, and its thread flagged for a person. */
async function settleSend(db: Db, job: TerminalJob, certain: boolean, failReason?: string): Promise<Settled[]> {
  const reason = certain ? "never_delivered" : "run_interrupted";
  const messageId = idFrom(job.payload, "message_id");
  if (!messageId) return [{ what: "message", changed: false, error: "no message_id on the job" }];
  // Conditional on 'queued': if the handler did record the send before dying,
  // that row already says 'sent', and saying otherwise would be a lie about a
  // message that reached a real person. Only a row still claiming to be on
  // its way is touched.
  // A run that died mid-send may have sent: its outcome is unknown, which is what lets an email's receipt still
  // settle it (00177's messages_guard) and what counts it toward its mailbox's day (mailbox_capacity).
  const { row, error } = await failQueuedSend(db, {
    tenantId: job.tenant_id,
    messageId,
    error: { reason, note: noteOf(certain, failReason), ...(certain ? {} : { outcome: "unknown" }) },
  });
  // A reply that never left is a customer with no answer: the thread is flagged for a person, as a failed
  // delivery flags it (core send.ts). A job that died marked the row failed and flagged nothing (I5). A campaign's
  // email is not a reply to anyone waiting: it is recorded on its row and flags nothing (Reach out D4).
  const campaign = row?.channel === "email" && isCampaignEmail(row.meta?.email?.request);
  const flagged =
    !error && row?.conversation_id && !campaign
      ? await upsertEscalation(
          db,
          job.tenant_id,
          row.conversation_id,
          "send_failed",
          `${row.sender === "ai" ? "The receptionist's reply" : "A reply"} never left: ${noteOf(certain, failReason)}.`,
        )
      : null;
  return [
    {
      what: "message",
      changed: !!row,
      ...(flagged ? { flagged } : {}),
      ...(error ? { error } : {}),
    },
  ];
}

/** An email's intake: the mailbox marked, and the thread flagged for a person when the email got as far as being kept. */
async function settleIntake(db: Db, job: TerminalJob): Promise<Settled[]> {
  // The intake owns this email's ending, so it owns the failure too.
  //
  // The deadman sweep used to cover this by accident, and wrongly: it claimed
  // the row, called it a receptionist that never answered, and marked it
  // handled. It no longer touches email (edge unfinished.ts), which would
  // have left a dead intake with nothing but a job alert -- the customer's
  // words sitting in a thread with no hold on it and nobody looking.
  //
  // What can be flagged is a thread, and there is one only if the intake got
  // as far as storing the email. Dying before that leaves nothing to find,
  // and the job's own alert is then the true and only signal.
  const receivedId = idFrom(job.payload, "received_id");
  if (!receivedId) return [{ what: "email", changed: false, error: "no received_id on the job" }];
  // The mailbox is told either way, and FIRST: it is the one thing that is
  // there whether or not the email got as far as being stored, so an intake
  // that died before it could make a thread still leaves a mark the owner
  // sees. It is cleared by the next email that is taken in, so a workspace
  // whose mail is flowing does not carry an old failure.
  const mailbox = await noteMailboxTrouble(db, job.tenant_id, idFrom(job.payload, "mailbox_id"));
  const { data, error } = await findEmailThreadOf(db, { tenantId: job.tenant_id, externalId: receivedId });
  if (error) return [{ what: "email", changed: false, ...mailbox, error: error.message }];
  const conversationId = data?.conversation_id ?? null;
  if (!conversationId) return [{ what: "email", changed: false, ...mailbox }];
  // The same hold the intake would have raised, in words that say what
  // actually happened rather than blaming the receptionist for not answering.
  const flagged = await upsertEscalation(db, job.tenant_id, conversationId, "email_review", EMAIL_UNFINISHED);
  return [{ what: "email", changed: true, flagged, ...mailbox }];
}

/** A run's batch: handed to a fresh run unless one is coming, or failed with why. */
async function settleBroadcast(db: Db, job: TerminalJob): Promise<Settled[]> {
  const broadcastId = idFrom(job.payload, "broadcast_id");
  if (!broadcastId) return [{ what: "broadcast", changed: false, error: "no broadcast_id on the job" }];
  // broadcastSend schedules its own next batch, so one lost link used to
  // strand the whole run: the broadcast sat 'failed' with half its people
  // reached and the rest queued for ever. The rest are HANDED TO A FRESH RUN
  // instead. A resumed batch reads the message row a dying run left
  // (core/messages/broadcast.ts alreadySent) rather than sending to that
  // person again, which is what makes a second run safe where a second
  // outbound_send is not. Conditional on the broadcast still claiming to be in
  // flight, so one that finished between the read and here is left exactly as
  // it finished; when no fresh run can be written, or too many already have
  // been, it falls back to the honest failure with the reason.
  const { data: row, error: readErr } = await findBroadcastState(db, { tenantId: job.tenant_id, broadcastId });
  if (readErr) return [{ what: "broadcast", changed: false, error: readErr.message }];
  // 'scheduled' as well as 'sending': a run killed before it could move the
  // row off 'scheduled' sent nobody, and leaving it there stranded the whole
  // broadcast where nothing would ever pick it up again — not sending, not
  // failed, and not said.
  if (!row || (row.state !== "sending" && row.state !== "scheduled")) return [{ what: "broadcast", changed: false }];

  const far = await howFar(db, job.tenant_id, broadcastId);
  if (far.error) return [{ what: "broadcast", changed: false, error: far.error }];
  const { reached, remaining } = far;

  // Is a run already coming? The dying run may have scheduled its own next
  // batch and then failed to report back, and that chain has been working the
  // queue for the ninety seconds it took this row's lease to expire. A second
  // chain alongside it reads the same queued rows, finds no message written
  // for them yet, and delivers to all of them AGAIN — the one thing a
  // broadcast must never do. A read that cannot say is treated as "yes",
  // because the cost of guessing wrong that way is only a broadcast that
  // shows as sending.
  const live = await countLiveBroadcastJobs(db, { tenantId: job.tenant_id, broadcastId, besides: job.id });
  if (live.error) return [{ what: "broadcast", changed: false, reached, remaining, error: live.error.message }];
  if ((live.count ?? 0) > 0) return [{ what: "broadcast", changed: false, resumed: true, reached, remaining }];

  const resumes = resumesOf(job.payload);
  if (resumes >= MAX_RESUMES)
    return failBroadcast(db, job, broadcastId, `${resumes} fresh runs in a row did not finish`, {
      reached,
      remaining,
    });
  try {
    // The count rides the payload, and so do the waits and stalls the run had (a resumed run still looks at the
    // day's sending hours): nothing else survives the death of the run. broadcastSend's own scheduleNext writes a
    // payload without the count, so a run that got as far as its next batch resets it.
    await scheduleJob(db, {
      tenantId: job.tenant_id,
      kind: "broadcast_send",
      dueAt: new Date(),
      payload: { ...nextBatch(broadcastId, carriedBy(job.payload)), resumes: resumes + 1 },
    });
    return [{ what: "broadcast", changed: true, resumed: true, reached, remaining }];
  } catch (e) {
    return failBroadcast(db, job, broadcastId, e instanceof Error ? e.message : String(e), { reached, remaining });
  }
}

/**
 * A lead's preview that will not be built (00497): marked failed, so a send waiting on it is skipped with why instead of
 * waiting for ever. A preview built, or failed already, is left as it is (preview_built answers false).
 */
async function settlePreview(db: Db, job: TerminalJob): Promise<Settled[]> {
  const id = idFrom(job.payload, "preview_id");
  if (!id) return [{ what: "preview", changed: false, error: "no preview_id on the job" }];
  return [{ what: "preview", changed: await recordPreviewBuilt(db, id, false, "build_failed") }];
}

/**
 * A part of a connection's history that will not come in (00478): the source's row says it stopped, with Try again, so a
 * stop is never only a failed job and Connections never says it is still bringing it in. A write of a run the row is no
 * longer held by changes nothing (import_ledger_note).
 */
async function settleImport(db: Db, job: TerminalJob): Promise<Settled[]> {
  const source = idFrom(job.payload, "source");
  if (!source || !IMPORT_SOURCES.some((s) => s === source))
    return [{ what: "import", changed: false, error: "no source on the job" }];
  const [run] = (idFrom(job.payload, "seq") ?? "1:1").split(":");
  const connection = idFrom(job.payload, "connection_id");
  await noteImport(db, {
    tenantId: job.tenant_id,
    source,
    connectionId: PER_MAILBOX_SOURCES.includes(source as ImportSource) ? connection : null,
    run: run || "1",
    state: "failed",
    error: IMPORT_STOPPED_WORDS.failed,
    add: true,
  });
  return [{ what: "import", changed: true }];
}

/**
 * A booking tool's notice that will not be read (00345): held for a person, unless the ledger already keeps one for it,
 * so it is in Settings › Business with Read again and never only a failed job. Its last try holds it itself; this is the
 * run that died on it.
 */
async function settleNotice(db: Db, job: TerminalJob): Promise<Settled[]> {
  const receivedId = idFrom(job.payload, "received_id");
  const tool = idFrom(job.payload, "tool");
  if (!receivedId || !tool) return [{ what: "notice", changed: false, error: "no received_id or tool on the job" }];
  const held = await holdNoticeIfUnkept(db, {
    tenant_id: job.tenant_id,
    notice_id: receivedId,
    tool,
    from_address: null,
    subject: null,
    received_at: new Date().toISOString(),
    outcome: "held",
    hold_reason: "unreadable",
    appointment_id: null,
  });
  return [{ what: "notice", changed: held }];
}

/**
 * One event's delivery that will not finish (00334): settled failed unless its subscriber's verdict is already on the
 * row, so Deliver again reaches it. A run that died before the verdict left the delivery scheduled, which nothing takes.
 */
async function settleDelivery(db: Db, job: TerminalJob, certain: boolean, reason?: string): Promise<Settled[]> {
  const eventId = idFrom(job.payload, "event_id");
  const subscriber = idFrom(job.payload, "subscriber");
  if (!eventId || !subscriber)
    return [{ what: "delivery", changed: false, error: "no event or subscriber on the job" }];
  const moved = await failOpenDelivery(db, {
    tenantId: job.tenant_id,
    eventId,
    subscriber,
    error: certain ? (reason ?? "it never ran") : RUN_INTERRUPTED,
  });
  return [{ what: "delivery", changed: moved }];
}

/**
 * A thread's draft that will not be written (00538): the row a run left saying it is being written says it was not, so the
 * page stops saying Drafting. A row written since, or claimed for a newer message, is left alone.
 */
async function settleDraft(db: Db, job: TerminalJob): Promise<Settled[]> {
  const conversationId = idFrom(job.payload, "conversation_id");
  const kind = idFrom(job.payload, "draft_kind");
  if (!conversationId || !isOneOf(REPLY_DRAFT_KINDS, kind))
    return [{ what: "draft", changed: false, error: "no thread or kind on the job" }];
  const moved = await recordConversationDraftFailed(db, {
    tenantId: job.tenant_id,
    conversationId,
    kind,
    forMessageId: idFrom(job.payload, "message_id"),
    whyFailed: "not_drafted",
  });
  return [{ what: "draft", changed: moved }];
}

/**
 * A file's look that will not finish (00551): the row stops saying Looking and the file stays usable under its own name, by
 * the one door every look's end goes through, so a good look a retry failed on stays as it was and the sweep leaves it for a
 * day. The edition is the job's, so a raised one still reads it again.
 */
async function settleFileLook(db: Db, job: TerminalJob): Promise<Settled[]> {
  const fileId = idFrom(job.payload, "file_id");
  if (!fileId) return [{ what: "file", changed: false, error: "no file on the job" }];
  const edition = Number(idFrom(job.payload, "edition") ?? FILE_LOOK_EDITION);
  await keepFileLook(db, {
    tenantId: job.tenant_id,
    id: fileId,
    status: "failed",
    edition: Number.isInteger(edition) ? edition : FILE_LOOK_EDITION,
    look: null,
    name: null,
    shows: null,
  });
  return [{ what: "file", changed: true }];
}

/**
 * A video's digest that will not finish (00556): the row stops saying Looking, by the same door a look's end goes through, so the
 * tile settles on what it has (its poster, its length) and the sweep tries the step left undone a day on while the video is young.
 */
async function settleVideoDigest(db: Db, job: TerminalJob): Promise<Settled[]> {
  const fileId = idFrom(job.payload, "file_id");
  if (!fileId) return [{ what: "file", changed: false, error: "no file on the job" }];
  await keepFileLook(db, {
    tenantId: job.tenant_id,
    id: fileId,
    status: "failed",
    edition: VIDEO_LOOK_EDITION,
    look: null,
    name: null,
    shows: null,
  });
  return [{ what: "file", changed: true }];
}

type Settler = (db: Db, job: TerminalJob, certain: boolean, why?: string) => Promise<Settled[]>;

/**
 * Who makes each kind's leavings final, whichever way its job ended: its last try threw, a run died and the ledger gave
 * up, or nothing knew the kind (tick.ts conclude reaches this for all three). Null for a kind that leaves nothing saying
 * it is still going. jobs/job-kinds.test.mjs holds it to kinds.ts `settles`.
 */
export const SETTLERS: Record<JobKind, Settler | null> = {
  outbound_send: settleSend,
  broadcast_send: settleBroadcast,
  email_ingest: settleIntake,
  booking_read: settleNotice,
  event_deliver: settleDelivery,
  history_import: settleImport,
  preview_build: settlePreview,
  reply_draft: settleDraft,
  file_look: settleFileLook,
  video_digest: settleVideoDigest,
  file_fetch: null,
  file_purge: null,
  line_provision: null,
  lead_round_start: null,
  lead_collect: null,
  lead_check: null,
  push_send: null,
  push_receipts: null,
  reply_read: null,
  inbound_answer: null,
  website_read: null,
  erasure_finish: null,
  canary: null,
};

/** The kind of row a kind's settlement is about, for a settlement that threw before it could say. */
const WHAT_OF: Partial<Record<JobKind, Settled["what"]>> = {
  outbound_send: "message",
  broadcast_send: "broadcast",
  email_ingest: "email",
  preview_build: "preview",
  history_import: "import",
  booking_read: "notice",
  event_deliver: "delivery",
  reply_draft: "draft",
  file_look: "file",
  video_digest: "file",
};

/**
 * Settle what this job was in the middle of. Never throws: a settlement that cannot be written is reported in its own
 * row, because the caller's job is to tell an owner the truth and "we could not check" is part of the truth.
 */
export async function settleJob(db: Db, job: TerminalJob, certain: boolean, reason?: string): Promise<Settled[]> {
  const settler = entryOf(SETTLERS, job.kind);
  if (!settler) return [];
  try {
    return await settler(db, job, certain, reason);
  } catch (e) {
    const subject = entryOf(WHAT_OF, job.kind) ?? "delivery";
    return [{ what: subject, changed: false, error: e instanceof Error ? e.message : String(e) }];
  }
}

/**
 * The sentence an owner reads about the wreckage, or null when there is none.
 * Built from what the writes actually returned, which is the only version an
 * owner can act on.
 */
export function saySettled(results: Settled[]): string | null {
  const lines: string[] = [];
  for (const result of results) {
    if (result.error) {
      lines.push(
        result.what === "message"
          ? `The message it was sending could not be updated (${result.error}), so it may still show as sending.`
          : result.what === "email"
            ? `The email it was taking in could not be flagged for a person (${result.error}), so look for it in the Inbox.`
            : result.what === "broadcast"
              ? `The broadcast could not be updated (${result.error}), so it may still show as sending.`
              : `What it was doing could not be marked as stopped (${result.error}), so it may still show as in progress.`,
      );
    } else if (result.changed && result.what === "import") {
      lines.push("Its source says it stopped, with Try again.");
    } else if (result.changed && result.what === "notice") {
      lines.push("The booking email is held for a person in Settings › Business, with Read again.");
    } else if (
      result.what === "preview" ||
      result.what === "delivery" ||
      result.what === "draft" ||
      result.what === "file"
    ) {
      // A preview marked not made, a delivery marked failed: the platform's leavings, said nowhere an owner reads.
    } else if (result.resumed) {
      // Whether this settlement handed it on or found a run already coming, the
      // owner's picture is the same: it is still going. What it does NOT say is
      // "nobody is sent it twice" — a run killed between the wire accepting a
      // message and the row recording it leaves no row for the next run to read.
      lines.push(
        `The broadcast carries on in a fresh run: ${result.reached ?? 0} reached so far, ${result.remaining ?? 0} still to go. Anyone it already recorded as sent is skipped, not sent again.`,
      );
    } else if (result.changed && result.notResumed) {
      lines.push(
        `The broadcast could not be handed to a fresh run (${result.notResumed}), so it has been marked failed; the ${result.reached ?? "people"} it had already reached still got it${typeof result.remaining === "number" ? `, and ${result.remaining} did not` : ""}.`,
      );
    } else if (result.changed && result.what === "email") {
      lines.push("The email it was taking in is in the Inbox and flagged for a person, so nobody has to find it.");
    } else if (result.what === "email") {
      // Nothing was stored, so there is no thread this could be held against:
      // the mailbox is the only place in the product it can be said at all.
      lines.push(
        result.mailbox === "marked"
          ? "The email it was taking in was never stored, so there is no thread to flag; the workspace's mailbox now says an email could not be taken in."
          : "The email it was taking in was never stored, so there is nothing to flag for a person.",
      );
    } else if (result.changed) {
      lines.push(
        result.what === "message"
          ? "The message has been marked failed, so it is no longer shown as on its way."
          : `The broadcast has been marked failed; the ${result.reached ?? "people"} it had already reached still got it${typeof result.remaining === "number" ? `, and ${result.remaining} did not` : ""}.`,
      );
    }
    // changed:false with no error means the row had already moved on by itself.
    // There is nothing to tell anyone about work that completed.
  }
  return lines.length ? lines.join(" ") : null;
}
