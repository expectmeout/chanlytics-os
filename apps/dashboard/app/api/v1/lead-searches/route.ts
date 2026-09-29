import { z } from "zod";
import { isUuid, LeadSearchPlanSchema, SPEND_LEADS } from "@chanlytics/contracts";
import { recordActivation, type Json } from "@chanlytics/db";
import { read, write, workspace } from "@/server/route";
import { serviceDb } from "@/server/service-db";
import { answerOf, estimateForRound, refusalOf } from "@/server/leads/leads";
import { load, readerContext } from "@/server/readers";
import { searches } from "@/server/readers/searches";

/**
 * GET /api/v1/lead-searches: every kept search of this workspace with its
 * latest round (lead_searches_view), newest first, and the rail's six counts
 * beside them — the two facts the Leads rail is drawn from, read together so
 * a page that shows both cannot show one of them stale.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), searches, undefined)).data,
});

/**
 * POST /api/v1/lead-searches: a plan becomes a search and its first round.
 *
 * The owner alone (it spends: PRD decision 6), on a workspace that may spend
 * (402 before anything else), counted against `lead_search`. The body is the
 * validated plan; the route computes what the round is expected to cost from
 * the card's brief prices and hands it to the door, which reserves the
 * month's leads and budget in the same transaction as the round row (E2) and
 * refuses in a word the route says as a sentence: paused, this month's leads,
 * the budget, today's cap.
 *
 * Beside the plan, an Ask card sends `thread_id`: the thread it was planned in
 * (00172), so the answer to the search's question lands there. The door keeps
 * it only when it is the caller's own thread in this workspace, and null
 * otherwise; the plan the door stores never carries it. A thread that is not
 * an id is dropped, never a refusal: the search is what was approved.
 */
const CreateSchema = z.intersection(LeadSearchPlanSchema, z.object({ thread_id: z.unknown().optional() }));

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_search",
  spend: true,
  // A refusal here is about finding leads, not about buying a number.
  spendWords: SPEND_LEADS,
  input: CreateSchema,
  handle: async ({ ctx, member, input }) => {
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
  },
});
