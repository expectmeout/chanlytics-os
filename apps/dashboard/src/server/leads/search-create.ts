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
import { isUuid, leadMonth, LeadSearchPlanSchema, DbFailure } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";
import { readMonthUsed, renewsOnOf } from "@/server/leads/allowance";
import { getTenantFacts } from "@/server/shared/tenant";
import { recordActivation } from "@chanlytics/db/events";
import { serviceDb } from "@/server/shared/service-db";
import { answerOf, estimateForRound, refusalOf } from "@/server/leads/leads";
import type { RouteContext } from "@/server/shared/with-route";
import type { Member } from "@/server/shared/route";
import { startLeadSearch } from "@chanlytics/db/leads";
import { asJson } from "@chanlytics/db/shared";

export const CreateSchema = z.intersection(LeadSearchPlanSchema, z.object({ thread_id: z.unknown().optional() }));

/**
 * The month's leads left as the press finds them, and the day they renew; null where they could not be read, and the door
 * decides as it always has. A search that waited on a running one's reservation finds more left than its card said.
 */
async function leadsLeftNow(ctx: RouteContext, member: Member): Promise<{ left: number; renewsOn: string } | null> {
  const now = new Date();
  const read = async () => {
    const { timezone } = await getTenantFacts(ctx.supabase, member.tenantId);
    const used = await readMonthUsed(ctx, member.tenantId, leadMonth(timezone, now));
    return { left: Math.max(0, used.cap - used.allowance), renewsOn: renewsOnOf(timezone, now) };
  };
  return read().catch(logAndGoOn("lead_search_left", null));
}

export async function createLeadSearch(ctx: RouteContext, member: Member, input: z.infer<typeof CreateSchema>) {
  const { thread_id: thread, ...rest } = input;
  // Asked for more than the month has left, it finds what is left now, as the card's button said, rather than coming back
  // as a question nobody can answer from a card (Ruben, 14 Nov 2026: "Find 64 leads" was pressed, and the door asked
  // "Find 267 now, or all 300 when your leads renew on Dec 1?"). None left is still the door's refusal.
  const month = rest.count > 0 ? await leadsLeftNow(ctx, member) : null;
  const count = month && month.left > 0 && month.left < rest.count ? Math.floor(month.left) : rest.count;
  // A new search starts at its plan's first version, whatever the card counted on the way (planVersionOf counts a
  // change made before it existed): the door refuses any other, and a card changed before Find failed (23 Oct 2026).
  const plan = { ...rest, count, version: 1 };
  const threadId = isUuid(thread) ? String(thread) : null;
  const { data, error } = await startLeadSearch(ctx.supabase, {
    p_tenant_id: member.tenantId,
    p_plan: asJson(plan),
    p_via: ctx.via === "ask" ? "ask" : "people",
    p_estimate_usd: estimateForRound(plan, "probe"),
    // Named only when there is one, so a search from the page calls the door as it always has.
    ...(threadId ? { p_thread_id: threadId } : {}),
  });
  if (error) throw new DbFailure(error, "lead_search_create");
  const answer = answerOf(data);
  const refused = refusalOf(answer);
  if (refused) throw refused;
  // The workspace's first search: the funnel's third milestone, written as the service role (the ledger's writer). An
  // analytics row never costs a search: nothing here may throw.
  try {
    await recordActivation(serviceDb(), member.tenantId, "first_lead_search", ctx.via === "ask" ? "ask" : "people");
  } catch {
    /* the milestone is written by the next search */
  }
  // What it finds, and, where the month cut it short, how many were asked and when the rest can follow.
  const cut = count < rest.count && month ? { asked: rest.count, renews_on: month.renewsOn } : {};
  return { search_id: answer.search_id, round_id: answer.round_id, count, ...cut };
}
