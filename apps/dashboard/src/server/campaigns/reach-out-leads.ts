import "server-only";
/**
 * Leads while a reach-out writes, and one lead's story (Reach out, Part 6: H8–H11). A search's lines come with its
 * chain as Playbooks reads it (chainsOf), so the strip's day's share is the number the chain's row says; a lead's story
 * is one definer read (00241 reach_out_lead_timeline), which a person's page reads too. "Stop writing to them" is the
 * acting member's door (00241 reach_out_lead_stop). Each read checks the member again in SQL; each refusal is said in
 * contracts' words (reachOutRefusal).
 */
import type {
  ReachOutLeadTimelineDto,
  ReachOutLeadsDto,
  ReachOutSearchLinesDto,
  ReachOutStopDto,
} from "@chanlytics/contracts";
import { emitEvent, ownerSendFactsOf, type OwnerSendFacts } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
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
