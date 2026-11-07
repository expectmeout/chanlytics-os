/**
 * reply_read (Reach out Part 5, 00222): core's readReply, over the rows the database keeps and the reader, the spend
 * the notice and the draft the edge injects (ctx.replies). payload: { message_id, stage? } -- no stage is the first
 * read, "reread-<n>" a re-read of a reply that could not be read, "draft" the draft a first read had no time for.
 */
import {
  DEFAULT_TIMEZONE,
  REACH_OUT_REPLY_DAYS,
  REPLY_DRAFT_RULES,
  isReplyIntent,
  isUnread,
  replySubject,
  type ReadingPlan,
} from "@chanlytics/contracts";
import { readReply, type DraftMark, type DraftState, type KeptReading, type ReplyFacts } from "@chanlytics/core";
import {
  applyReplyReading,
  archiveConversation,
  claimReplyTell,
  markReplyDraft,
  markReplyTold,
  findReachOutReply,
  replyReadingOf,
  resolveEscalationByReason,
  type ReachOutReplyOf,
  type ReplyReadingRow,
} from "@chanlytics/db/campaigns";
import { claimConversationDraft, writeConversationDraft } from "@chanlytics/db/ask";
import { type Json } from "@chanlytics/db/types";
import { logger } from "@chanlytics/log";
import type { ClaimedJob, JobContext } from "../runner/context";
import { FUNCTION_CEILING_MS, LEASE_SECONDS, type Db } from "../runner/ledger";

/** The plan as the door takes it: every field contracts' readingPlan answers, as JSON. */
function planJson(plan: ReadingPlan): Json {
  return { ...plan, step: plan.step ? { ...plan.step } : null };
}

/** The reply as the verb reads it. */
function replyFactsOf(reachOutReplyOf: ReachOutReplyOf): ReplyFacts {
  return {
    conversationId: reachOutReplyOf.conversation_id,
    claim: reachOutReplyOf.claim,
    text: reachOutReplyOf.text,
    subject: reachOutReplyOf.subject,
    // The intake's bare from.address, as it kept it: a display-name form would suppress nothing (normalizeEmail).
    from: reachOutReplyOf.from,
    receivedAt: Date.parse(reachOutReplyOf.received_at),
    answered: reachOutReplyOf.answered_text,
    business: reachOutReplyOf.business,
    leadAddress: reachOutReplyOf.lead_email,
    leadWebsite: reachOutReplyOf.lead_website,
    leadWebsiteRoot: reachOutReplyOf.lead_website_root,
    signedBy: reachOutReplyOf.signed_by,
    tz: reachOutReplyOf.tz ?? DEFAULT_TIMEZONE,
    fromName: reachOutReplyOf.from_name,
    notNames: reachOutReplyOf.not_names,
  };
}

/** The kept reading as the verb reads it. A row it cannot read as one is a failed read, not a missing one. */
function keptReadingOf(row: ReplyReadingRow): KeptReading {
  if (!isReplyIntent(row.intent)) throw new Error(`reply_read: a reading says ${row.intent}`);
  if (row.unread !== null && !isUnread(row.unread))
    throw new Error(`reply_read: a reading was not read for ${row.unread}`);
  const plan = row.plan && typeof row.plan === "object" && !Array.isArray(row.plan) ? row.plan : {};
  if (!DRAFT_STATES.includes(row.draft_state as DraftState))
    throw new Error(`reply_read: a draft is ${row.draft_state}`);
  return {
    intent: row.intent,
    summary: row.summary,
    unread: isUnread(row.unread) ? row.unread : null, // null is read; any other value refused above
    rereads: row.rereads,
    tell: plan.tell === true,
    told: row.told_at !== null,
    undone: row.undone_at !== null,
    draft: plan.draft === "answer" || plan.draft === "thanks" ? plan.draft : null,
    draftState: row.draft_state as DraftState, // one of DRAFT_STATES, checked above
    signerOffered: row.signer_state === "offered" ? row.signer_name : null,
    draftText: row.draft,
  };
}

const DRAFT_STATES: readonly DraftState[] = ["none", "waiting", "written", "not_written"];

/** A draft's mark as the door takes it. */
function draftMarkOf(m: DraftMark): { state: DraftMark["state"]; draft: string | null; why: string | null } {
  if (m.state === "written") return { state: m.state, draft: m.draft, why: null };
  if (m.state === "not_written") return { state: m.state, draft: null, why: m.why };
  return { state: m.state, draft: null, why: null };
}

/**
 * A reading's draft, kept where every page reads a thread's draft (decision 0093): the row claimed for this message, so an
 * older one is written over, then its words. Sent or changed like any other.
 */
async function keepReachOutDraft(
  db: Db,
  tenantId: string,
  details: { conversationId: string; messageId: string; text: string; subject: string | null; used: readonly string[] },
): Promise<void> {
  const row = { tenantId, conversationId: details.conversationId, kind: "reply", forMessageId: details.messageId };
  const shared = { source: "reach_out", rules: REPLY_DRAFT_RULES };
  await claimConversationDraft(db, { ...row, ...shared });
  await writeConversationDraft(db, {
    ...row,
    ...shared,
    state: "ready",
    words: { text: details.text, subject: replySubject(details.subject), brief: null, asks: [] },
    used: details.used,
  });
}

export async function replyRead(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const replies = ctx.replies;
  if (!replies) throw new Error("reply_read: this runtime holds no reader");
  const messageId = typeof job.payload.message_id === "string" ? job.payload.message_id : "";
  if (!messageId) throw new Error("reply_read: payload.message_id is required");
  const { db } = ctx;
  const where = (tenantId: string, id: string) => ({ tenantId, messageId: id });
  const outcome = await readReply(
    {
      reply: async (tenantId, id) => {
        const r = await findReachOutReply(db, { ...where(tenantId, id), days: REACH_OUT_REPLY_DAYS });
        return r ? replyFactsOf(r) : null;
      },
      reading: async (tenantId, id) => {
        const row = await replyReadingOf(db, where(tenantId, id));
        return row ? keptReadingOf(row) : null;
      },
      mayRead: (tenantId, at) => replies.mayRead(tenantId, new Date(at)),
      ask: (system, user) => replies.ask(system, user, ctx.deadline, { tenantId: job.tenant_id, subjectId: messageId }),
      apply: (tenantId, id, item) =>
        applyReplyReading(db, {
          ...where(tenantId, id),
          reading: {
            intent: item.reading.intent,
            summary: item.reading.summary,
            day: item.reading.day,
            refer_to: item.reading.referTo,
            unread: item.unread,
            // The signer the gate kept (0052): offered to the owner, or taken when the plan says adoptSigner.
            signer: item.reading.signer,
          },
          plan: planJson(item.plan),
          reread: item.reread,
          days: REACH_OUT_REPLY_DAYS,
        }),
      claimTell: (tenantId, id, staleBefore) =>
        claimReplyTell(db, { ...where(tenantId, id), staleBefore: new Date(staleBefore) }),
      tell: (tenantId, notice) => replies.tell(tenantId, notice),
      draft: (tenantId, ask) => replies.draft(tenantId, ask),
      markDraft: (tenantId, id, mark) => markReplyDraft(db, { ...where(tenantId, id), ...draftMarkOf(mark) }),
      keepDraft: (tenantId, d) => keepReachOutDraft(db, tenantId, d),
      told: (tenantId, id, claim) => markReplyTold(db, { ...where(tenantId, id), claim }),
      scheduleOnce: (at, payload) => ctx.scheduleOnce("reply_read", new Date(at), payload),
      // What the intake opened, the reading closes: the flag by its reason, the thread whole, on the service role (the
      // platform's own close, so the rows are counted there rather than trusted).
      resolveEscalation: (tenantId, conversationId, reason) =>
        resolveEscalationByReason(db, { tenantId, conversationId, reason }),
      archiveConversation: (tenantId, conversationId) => archiveConversation(db, { tenantId, conversationId }),
      now: Date.now,
    },
    // A claim on the notice is stale once no run that could hold it is still alive: the lease less the function's
    // ceiling. A run is killed by the ceiling and the ledger takes its job back at the lease, so the try that follows a
    // run that died telling finds that run's claim stale, and a retry after a throw (two minutes, then ten) always does.
    {
      tenantId: job.tenant_id,
      messageId,
      stage: job.payload.stage,
      tellStaleMs: LEASE_SECONDS * 1000 - FUNCTION_CEILING_MS,
      deadline: ctx.deadline,
    },
  );
  logger().info("reply_read", { tenant_id: job.tenant_id, job: job.id, outcome });
}
