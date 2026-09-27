/**
 * reply_read (Reach out Part 5, 00222): core's readReply, over the rows the database keeps and the reader, the spend
 * and the notice the edge injects (ctx.replies). payload: { message_id, stage? } -- no stage is the first read,
 * "reread-<n>" a re-read of a reply that could not be read.
 */
import {
  DEFAULT_TIMEZONE,
  REACH_OUT_REPLY_DAYS,
  isReplyIntent,
  isUnread,
  type ReadingPlan,
} from "@chanlytics/contracts";
import { readReply, type KeptReading, type ReplyFacts } from "@chanlytics/core";
import {
  applyReplyReading,
  claimReplyTell,
  markReplyTold,
  reachOutReplyOf,
  replyReadingOf,
  type Json,
  type ReachOutReplyOf,
  type ReplyReadingRow,
} from "@chanlytics/db";
import type { ClaimedJob, JobContext } from "./context";
import { FUNCTION_CEILING_MS, LEASE_SECONDS } from "./ledger";

/** The plan as the door takes it: every field contracts' readingPlan answers, as JSON. */
function planJson(plan: ReadingPlan): Json {
  return { ...plan, step: plan.step ? { ...plan.step } : null };
}

/** The reply as the verb reads it. */
function replyFactsOf(r: ReachOutReplyOf): ReplyFacts {
  return {
    conversationId: r.conversation_id,
    claim: r.claim,
    text: r.text,
    subject: r.subject,
    // The intake's bare from.address, as it kept it: a display-name form would suppress nothing (normalizeEmail).
    from: r.from,
    receivedAt: Date.parse(r.received_at),
    answered: r.answered_text,
    business: r.business,
    leadAddress: r.lead_email,
    leadWebsite: r.lead_website,
    tz: r.tz ?? DEFAULT_TIMEZONE,
  };
}

/** The kept reading as the verb reads it. A row it cannot read as one is a failed read, not a missing one. */
function keptReadingOf(row: ReplyReadingRow): KeptReading {
  if (!isReplyIntent(row.intent)) throw new Error(`reply_read: a reading says ${row.intent}`);
  if (row.unread !== null && !isUnread(row.unread))
    throw new Error(`reply_read: a reading was not read for ${row.unread}`);
  const plan = row.plan && typeof row.plan === "object" && !Array.isArray(row.plan) ? row.plan : {};
  return {
    intent: row.intent,
    summary: row.summary,
    unread: isUnread(row.unread) ? row.unread : null, // null is read; any other value refused above
    rereads: row.rereads,
    tell: plan.tell === true,
    told: row.told_at !== null,
    undone: row.undone_at !== null,
  };
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
        const r = await reachOutReplyOf(db, { ...where(tenantId, id), days: REACH_OUT_REPLY_DAYS });
        return r ? replyFactsOf(r) : null;
      },
      reading: async (tenantId, id) => {
        const row = await replyReadingOf(db, where(tenantId, id));
        return row ? keptReadingOf(row) : null;
      },
      mayRead: (tenantId, at) => replies.mayRead(tenantId, new Date(at)),
      ask: (system, user) => replies.ask(system, user, ctx.deadline),
      apply: (tenantId, id, p) =>
        applyReplyReading(db, {
          ...where(tenantId, id),
          reading: {
            intent: p.reading.intent,
            summary: p.reading.summary,
            day: p.reading.day,
            refer_to: p.reading.referTo,
            unread: p.unread,
          },
          plan: planJson(p.plan),
          reread: p.reread,
          days: REACH_OUT_REPLY_DAYS,
        }),
      claimTell: (tenantId, id, staleBefore) =>
        claimReplyTell(db, { ...where(tenantId, id), staleBefore: new Date(staleBefore) }),
      tell: (tenantId, notice) => replies.tell(tenantId, notice),
      told: (tenantId, id, claim) => markReplyTold(db, { ...where(tenantId, id), claim }),
      scheduleOnce: (at, payload) => ctx.scheduleOnce("reply_read", new Date(at), payload),
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
    },
  );
  console.log(JSON.stringify({ level: "info", event: "reply_read", tenant: job.tenant_id, job: job.id, outcome }));
}
