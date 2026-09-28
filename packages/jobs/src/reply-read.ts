/**
 * reply_read (Reach out Part 5, 00222): core's readReply, over the rows the database keeps and the reader, the spend
 * the notice and the draft the edge injects (ctx.replies). payload: { message_id, stage? } -- no stage is the first
 * read, "reread-<n>" a re-read of a reply that could not be read, "draft" the draft a first read had no time for.
 */
import {
  DEFAULT_TIMEZONE,
  REACH_OUT_REPLY_DAYS,
  isReplyIntent,
  isUnread,
  type ReadingPlan,
} from "@chanlytics/contracts";
import { readReply, type DraftMark, type DraftState, type KeptReading, type ReplyFacts } from "@chanlytics/core";
import {
  applyReplyReading,
  claimReplyTell,
  markReplyDraft,
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
    leadWebsiteRoot: r.lead_website_root,
    signedBy: r.signed_by,
    tz: r.tz ?? DEFAULT_TIMEZONE,
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
      draft: (tenantId, ask) => replies.draft(tenantId, ask),
      markDraft: (tenantId, id, mark) => markReplyDraft(db, { ...where(tenantId, id), ...draftMarkOf(mark) }),
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
      deadline: ctx.deadline,
    },
  );
  console.log(JSON.stringify({ level: "info", event: "reply_read", tenant: job.tenant_id, job: job.id, outcome }));
}
