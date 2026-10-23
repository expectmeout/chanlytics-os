/**
 * A people plan becomes a search and its one round (POST /api/v1/lead-searches/people; the people card, 00430): the
 * route's policy is the owner's, on a workspace that may spend, counted against lead_search, as a places search is.
 * This works out what the round may cost from the card's brief prices (contracts peopleEstimateUsd) and hands the plan
 * to the door (lead_people_search_create through packages/db), which reserves the month's leads and the budget with
 * the round and refuses in a word said here as a sentence. The workspace's first search writes the funnel's third
 * milestone, as a places one does; an analytics row never costs a search.
 */
import { LEAD_CARDS, isUuid, peopleEstimateUsd, type LeadPeopleSearchInput } from "@chanlytics/contracts";
import { leadPeopleSearchCreate, recordActivation } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { answerOf, refusalOf } from "@/server/leads/leads";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

/** What a people search may cost, from the people card's own prices. */
function estimateOf(count: number): number {
  const brief = LEAD_CARDS.find((c) => c.id === "people_at_companies");
  return peopleEstimateUsd(count, {
    perPerson: brief?.costPerPlaceUsd ?? 0.002,
    perJudge: brief?.judgePerPlaceUsd ?? 0.0023,
    perCheck: brief?.checkPerEmailUsd ?? 0.00089,
    start: brief?.startUsd ?? 0.01,
  });
}

export async function createPeopleSearch(ctx: RouteContext, member: Member, input: LeadPeopleSearchInput) {
  const via = input.via === "ask" || ctx.via === "ask" ? "ask" : "people";
  const answer = await leadPeopleSearchCreate(ctx.supabase, {
    tenantId: member.tenantId,
    plan: input.plan,
    via,
    estimateUsd: estimateOf(input.plan.count),
    threadId: isUuid(input.thread_id) ? String(input.thread_id) : null,
  });
  const a = answerOf(answer);
  const refused = refusalOf(a);
  if (refused) throw refused;
  try {
    await recordActivation(serviceDb(), member.tenantId, "first_lead_search", via);
  } catch {
    /* the milestone is written by the next search */
  }
  return { search_id: a.search_id, round_id: a.round_id };
}
