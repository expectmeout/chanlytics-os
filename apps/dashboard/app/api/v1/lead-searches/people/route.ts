import { LeadPeopleSearchSchema, SPEND_LEADS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { createPeopleSearch } from "@/server/leads/lead-people-search";

/**
 * POST /api/v1/lead-searches/people: a people plan becomes a search and its one round (the people card, 00429).
 *
 * As POST lead-searches is for places: the owner's (it spends), on a workspace that may spend (402 before anything
 * else), counted against `lead_search`. The body is the validated plan (titles, seniority, industries, sizes, states, a
 * count), where it was made, and the Ask thread it was planned in; the route works out what it may cost from the card's
 * brief prices, and the door reserves the month's leads and the budget with the round, or refuses in a word said as a
 * sentence. The handle is createPeopleSearch in src/server/leads/lead-people-search.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_search",
  spend: true,
  spendWords: SPEND_LEADS,
  input: LeadPeopleSearchSchema,
  handle: ({ ctx, member, input }) => createPeopleSearch(ctx, member, input),
});
