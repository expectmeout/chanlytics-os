import "server-only";
/**
 * The owner's word, for a reach-out its owner sends (00428). On an email handed to them: it went (Sent), or it did not
 * (Skip); the door (reach_out_send_said) writes the email, the send and the lead in one transaction, under the email's
 * own id (core sendMessageId), or skips it with why. On a lead an email they sent went to: what the business wrote back,
 * read as a person's reply through the one reading door (reach_out_reply_said → reach_out_reply_apply), with the plan
 * made as the reply job makes it (contracts readingPlan, claim owner: it tells nobody and drafts nothing). Both are an
 * acting member's, checked again in SQL; each refusal is said in contracts' words (reachOutRefusal).
 */
import {
  REACH_OUT_SAID_WORDS,
  readingPlan,
  type OwnerSaidIntent,
  type ReachOutReplySaidInput,
  type ReachOutSaidDto,
  type ReachOutSaidOutcome,
} from "@chanlytics/contracts";
import { sendMessageId } from "@chanlytics/core";
import { emitEvent, leadReplyFactsOf, replySaid, sendSaid, type Json } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { tenantFacts } from "@/server/tenant";
import type { RouteContext } from "@/server/with-route";
import { reachOutRefusal } from "@/server/campaigns/reach-outs";

/** The owner's word on an email handed to them: it went, or it did not. Said once; a second word answers how it stands. */
export async function saySend(
  ctx: RouteContext,
  send: { id: string; tenant_id: string; broadcast_id: string; attempts: number },
  outcome: ReachOutSaidOutcome,
): Promise<ReachOutSaidDto> {
  const messageId = outcome === "sent" ? await sendMessageId(send.id, send.attempts) : null;
  const r = await sendSaid(ctx.supabase, { sendId: send.id, outcome, messageId, reason: null });
  if (r.error) throw reachOutRefusal(r.error);
  // A draft left out on its owner's word is a decision about an email of the run, as a held one's Skip is.
  if (r.data.said && outcome === "not_sent")
    await emitEvent(serviceDb(), send.tenant_id, "reach_out.send_decided", "broadcast", send.broadcast_id, {
      decision: "skip",
      by: ctx.userId,
    });
  return { send_id: send.id, said: r.data.said, state: r.data.state, reason: r.data.reason ?? null };
}

/** What the business wrote back, as its owner says it on the lead: read and applied once, undone as any reading is. */
export async function sayReply(
  ctx: RouteContext,
  lead: { id: string; tenant_id: string },
  input: ReachOutReplySaidInput,
): Promise<{
  lead_id: string;
  applied: boolean;
  intent: OwnerSaidIntent;
  message_id: string | null;
  /** When a not now brings the lead back (the plan's resume_at), which the page says. */
  resume_at: string | null;
}> {
  const [facts, tenant] = await Promise.all([
    leadReplyFactsOf(ctx.supabase, { tenantId: lead.tenant_id, leadId: lead.id }),
    tenantFacts(ctx.supabase, lead.tenant_id),
  ]);
  const now = Date.now();
  const reading = {
    intent: input.intent,
    summary: "",
    day: input.day ?? null,
    referTo: input.refer_to?.trim() || null,
    signer: null,
  };
  const plan = readingPlan(reading, {
    claim: "owner",
    receivedAt: now,
    tz: tenant.timezone,
    business: facts?.business_name ?? "",
    leadAddress: facts?.email ?? null,
    leadWebsite: facts?.website_host ?? null,
    leadWebsiteRoot: facts?.website_root ?? null,
    replyFrom: null,
    reread: false,
    readAt: now,
  });
  const planJson: Json = { ...plan, step: plan.step ? { ...plan.step } : null };
  const r = await replySaid(ctx.supabase, {
    leadId: lead.id,
    reading: { intent: reading.intent, summary: null, day: reading.day, refer_to: reading.referTo, signer: null },
    plan: planJson,
    note: REACH_OUT_SAID_WORDS.note(input.intent),
  });
  if (r.error) throw reachOutRefusal(r.error);
  return {
    lead_id: lead.id,
    applied: r.data.applied,
    intent: input.intent,
    message_id: r.data.message_id ?? null,
    resume_at: plan.resumeAt,
  };
}
