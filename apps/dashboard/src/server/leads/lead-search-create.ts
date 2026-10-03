/**
 * A plan becomes a search and its first round (POST /api/v1/lead-searches): the route's policy is the owner alone, on a
 * workspace that may spend, counted against lead_search; this computes what the round is expected to cost from the
 * card's brief prices and hands it to the database function, which reserves the month's leads and budget in the same
 * transaction as the round row and refuses in a word said here as a sentence. Beside the plan an Ask card sends the
 * thread it was planned in, which the function keeps only when it is the caller's own. The workspace's first search
 * also writes the funnel's third milestone (first_lead_search) as the service role; an analytics row never costs a
 * search. CreateSchema is the body the route declares.
 */
import { z } from "zod";
import { isUuid, LeadSearchPlanSchema } from "@chanlytics/contracts";
import { recordActivation, type Json } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { answerOf, estimateForRound, refusalOf } from "@/server/leads/leads";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

export const CreateSchema = z.intersection(LeadSearchPlanSchema, z.object({ thread_id: z.unknown().optional() }));

export async function createLeadSearch(ctx: RouteContext, member: Member, input: z.infer<typeof CreateSchema>) {
  const { thread_id: thread, ...rest } = input;
  const plan = rest;
  const threadId = isUuid(thread) ? String(thread) : null;
  const { data, error } = await ctx.supabase.rpc("lead_search_create", {
    p_tenant_id: member.tenantId,
    p_plan: plan as unknown as Json,
    p_via: ctx.via === "ask" ? "ask" : "people",
    p_estimate_usd: estimateForRound(plan, "probe"),
    // Named only when there is one, so a search from the page calls the door as it always has.
    ...(threadId ? { p_thread_id: threadId } : {}),
  });
  if (error) throw new Error(`lead_search_create: ${error.message}`);
  const a = answerOf(data);
  const refused = refusalOf(a);
  if (refused) throw refused;
  // The workspace's first search: the funnel's third milestone, written as the service role (the ledger's writer). An
  // analytics row never costs a search: nothing here may throw.
  try {
    await recordActivation(serviceDb(), member.tenantId, "first_lead_search", ctx.via === "ask" ? "ask" : "people");
  } catch {
    /* the milestone is written by the next search */
  }
  return { search_id: a.search_id, round_id: a.round_id };
}
