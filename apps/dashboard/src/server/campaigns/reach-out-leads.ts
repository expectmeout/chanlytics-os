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

/** One lead's story; null when the workspace does not hold the lead. */
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
  return data ? dtoOf<ReachOutLeadTimelineDto>(data) : null;
}

/** "Stop writing to them", as the caller: the door's answer, or its refusal in contracts' words. */
export async function stopLead(ctx: Pick<RouteContext, "supabase">, leadId: string): Promise<ReachOutStopDto> {
  const { data, error } = await ctx.supabase.rpc("reach_out_lead_stop", { p_lead_id: leadId });
  if (error) throw reachOutRefusal(error);
  return dtoOf<ReachOutStopDto>(data);
}
