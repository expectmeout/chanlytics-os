import "server-only";
/**
 * Leads while a reach-out writes, and one lead's story (Reach out, Part 6: H8–H11). A search's lines come with its
 * chain as Playbooks reads it (chainsOf), so the strip's day's share is the number the chain's row says; a lead's story
 * is one definer read (00241 reach_out_lead_timeline), which a person's page reads too. "Stop writing to them" is the
 * acting member's door (00241 reach_out_lead_stop), and "They wrote back…" the reading door's, for an email its owner sent
 * (00428 reach_out_reply_said). Each read checks the member again in SQL; each refusal is said in contracts' words
 * (reachOutRefusal).
 */
import {
  REACH_OUT_SAID_WORDS,
  readingPlan,
  type OwnerSaidIntent,
  type ReachOutLeadTimelineDto,
  type ReachOutLeadsDto,
  type ReachOutReplySaidInput,
  type ReachOutSearchLinesDto,
  type ReachOutStopDto,
} from "@chanlytics/contracts";
import {
  emitEvent,
  leadReplyFactsOf,
  ownerSendFactsOf,
  replySaid,
  type Json,
  type OwnerSendFacts,
} from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { tenantFacts } from "@/server/tenant";
import type { RouteContext } from "@/server/with-route";
import { chainsOf, dtoOf, reachOutRefusal } from "@/server/campaigns/reach-outs";

/** An open search's chain and its leads' lines; both null when the search has no chain. */
export async function leadLinesOf(ctx: RouteContext, tenantId: string, searchId: string): Promise<ReachOutLeadsDto> {
  const { data, error } = await ctx.supabase.rpc("reach_out_search_lines", {
    p_tenant_id: tenantId,
    p_search_id: searchId,
  });
  if (error) throw reachOutRefusal(error);
  const lines = data ? dtoOf<ReachOutSearchLinesDto>(data) : null;
  if (!lines) return { lines: null, chain: null, timeline: null };
  const chain = (await chainsOf(ctx, tenantId)).find((c) => c.root_id === lines.chain.root_id) ?? null;
  return { lines, chain, timeline: null };
}

/**
 * One lead's story; null when the workspace does not hold the lead. Of a reach-out its owner sends (00428): an email
 * handed to them names the run it waits in, where they send it (the peek's Send it), and one that left from no mailbox
 * says whether it went on their word (from their own inbox, not a mailbox before 00424). Read beside the story, which
 * never fails for it.
 */
export async function leadTimelineOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  leadId: string,
): Promise<ReachOutLeadTimelineDto | null> {
  const { data, error } = await ctx.supabase.rpc("reach_out_lead_timeline", {
    p_tenant_id: tenantId,
    p_lead_id: leadId,
  });
  if (error) throw reachOutRefusal(error);
  if (!data) return null;
  const story = dtoOf<ReachOutLeadTimelineDto>(data);
  const owners = story.sends.filter((s) => s.state === "drafted" || (s.left && !s.from && !s.host)).map((s) => s.id);
  if (owners.length === 0) return story;
  const facts = await ownerSendFactsOf(ctx.supabase, { tenantId, sendIds: owners }).catch(
    () => new Map<string, OwnerSendFacts>(),
  );
  return {
    ...story,
    sends: story.sends.map((s) => {
      const f = facts.get(s.id);
      return f ? { ...s, run_id: f.runId, said: f.said } : s;
    }),
  };
}

/** "Stop writing to them", as the caller: the door's answer, or its refusal in contracts' words. */
export async function stopLead(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  lead: { id: string; tenant_id: string },
): Promise<ReachOutStopDto> {
  const { data, error } = await ctx.supabase.rpc("reach_out_lead_stop", { p_lead_id: lead.id });
  if (error) throw reachOutRefusal(error);
  // On the ledger: a business stops hearing from the workspace because a member said so, and nothing recorded who.
  await emitEvent(serviceDb(), lead.tenant_id, "reach_out.lead_stopped", "lead", lead.id, { by: ctx.userId });
  return dtoOf<ReachOutStopDto>(data);
}

/**
 * What the business wrote back, as its owner says it on the lead (00428): read as a person's reply through the one
 * reading door (reach_out_reply_said → reach_out_reply_apply), with the plan made here as the reply job makes it
 * (contracts readingPlan, claim owner: it tells nobody and drafts nothing). The door is the service role's, for the
 * member the route checked, so no plan reaches it but the one rule's; once per email that went, so a second word (another
 * tab, a press retried) answers already and writes nothing.
 */
export async function sayReply(
  ctx: RouteContext,
  lead: { id: string; tenant_id: string },
  input: ReachOutReplySaidInput,
): Promise<{
  lead_id: string;
  applied: boolean;
  /** A reading of that email stood already: nothing was written. */
  already: boolean;
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
  const r = await replySaid(serviceDb(), {
    tenantId: lead.tenant_id,
    userId: ctx.userId,
    leadId: lead.id,
    reading: { intent: reading.intent, summary: null, day: reading.day, refer_to: reading.referTo, signer: null },
    plan: planJson,
    note: REACH_OUT_SAID_WORDS.note(input.intent),
  });
  if (r.error) throw reachOutRefusal(r.error);
  return {
    lead_id: lead.id,
    applied: r.data.applied,
    already: r.data.already === true,
    intent: input.intent,
    message_id: r.data.message_id ?? null,
    resume_at: r.data.applied ? plan.resumeAt : null,
  };
}
