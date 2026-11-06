/**
 * reply_draft (decision 0093, 00538): core's verbs over the rows the database keeps, and the writer and the reader the edge
 * injects. payload: { conversation_id, draft_kind, rules, message_id? }: the once-only key's parts (job_kinds), a thread,
 * kind, message and edition while one waits. The edge's door and sweep build the same ports (`replyDraftPortsOf`).
 */
import { REPLY_DRAFT_RULES, senderVerdictOf, setsAside } from "@chanlytics/contracts";
import { askReplyDraft, writeReplyDraft, type AskReplyDraftOutcome, type ReplyDraftPorts } from "@chanlytics/core";
import {
  conversationDraftClaim,
  conversationDraftDrop,
  conversationDraftWrite,
  conversationSetAside,
  mailboxSenderVerdicts,
  noteMailboxLeft,
  replyDraftThreadOf,
  senderReadingOf,
  talksWith,
} from "@chanlytics/db";
import { logger } from "@chanlytics/channels";
import type { ClaimedJob, JobContext, ReplyDraftEdge } from "../runner/context";
import type { Db } from "../runner/ledger";
import { scheduleJobOnce } from "../runner/schedule";

/** What asks for a draft: everything but the writer, so a runtime that holds none can still ask. */
function askPorts(db: Db): Pick<ReplyDraftPorts, "thread" | "claim" | "scheduleDraft"> {
  return {
    thread: (tenantId, conversationId) => replyDraftThreadOf(db, tenantId, conversationId),
    claim: (d) => conversationDraftClaim(db, { ...d, rules: REPLY_DRAFT_RULES }),
    scheduleDraft: (tenantId, payload) =>
      scheduleJobOnce(db, { tenantId, kind: "reply_draft", dueAt: new Date(), payload }),
  };
}

/** The verbs' ports, over this database and what the edge injects. */
export function replyDraftPortsOf(db: Db, edge: ReplyDraftEdge): ReplyDraftPorts {
  return {
    ...askPorts(db),
    keep: (d) => conversationDraftWrite(db, { ...d, rules: REPLY_DRAFT_RULES }),
    letGo: (d) => conversationDraftDrop(db, d),
    sender: {
      said: async (tenantId, address) => senderVerdictOf(await mailboxSenderVerdicts(db, tenantId), address),
      talks: (tenantId, address) => talksWith(db, tenantId, address),
      reading: (tenantId, address) => senderReadingOf(db, tenantId, address),
      // The reader keeps what it read (edge mailbox-reader.ts), so a sender is read once.
      read: (tenantId, email, until) => edge.readSender(tenantId, email, until),
    },
    setAside: (tenantId, conversationId, why) => conversationSetAside(db, { tenantId, conversationId, why }),
    write: edge.write,
  };
}

/**
 * What the hosted address asks of a stranger's email (core email-ingest senderLeft): the same order a connected mailbox's
 * sorting asks in, past what the workspace said. A sender it leaves is noted on the owner's list. Never throws: a model or
 * a read that failed lets the email in, which a person then reads, and a draft's own judging reads them again.
 */
export function senderLeftAt(db: Db, edge: ReplyDraftEdge, until: number) {
  return async (
    tenantId: string,
    email: { from: string; name: string | null; subject: string | null; words: string | null; answers: boolean },
  ): Promise<"pitch" | "notice" | null> => {
    try {
      if (await talksWith(db, tenantId, email.from)) return null;
      const reading =
        (await senderReadingOf(db, tenantId, email.from)) ?? (await edge.readSender(tenantId, email, until));
      if (!reading || !setsAside(reading.kind)) return null;
      await noteMailboxLeft(db, {
        tenantId,
        address: email.from,
        name: email.name,
        why: reading.kind,
        at: new Date().toISOString(),
      });
      return reading.kind;
    } catch (e) {
      logger().warn("email_sender_unread", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  };
}

/** Whether a thread is owed a draft, and if so its row claimed and its job scheduled: the subscriber's, and the sweep's. */
export function askReplyDraftOf(
  db: Db,
  tenantId: string,
  conversationId: string,
  over: { now?: Date; again?: boolean; staleBefore?: Date } = {},
): Promise<AskReplyDraftOutcome> {
  return askReplyDraft(askPorts(db), { tenantId, conversationId, now: over.now ?? new Date(), ...over });
}

export async function replyDraft(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.drafts) throw new Error("reply_draft: this runtime holds no writer");
  const conversationId = typeof job.payload.conversation_id === "string" ? job.payload.conversation_id : "";
  if (!conversationId) throw new Error("reply_draft: payload.conversation_id is required");
  const outcome = await writeReplyDraft(replyDraftPortsOf(ctx.db, ctx.drafts), {
    tenantId: job.tenant_id,
    conversationId,
    kind: job.payload.draft_kind === "brief" ? "brief" : "reply",
    forMessageId: typeof job.payload.message_id === "string" ? job.payload.message_id : null,
    now: new Date(),
    deadline: ctx.deadline,
  });
  logger().info("reply_draft_job", { tenant_id: job.tenant_id, job: job.id, outcome });
}
