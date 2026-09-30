import { SPEND_LEADS } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { searches } from "@/server/readers/searches";
import { createLeadSearch, CreateSchema } from "@/server/leads/lead-search-create";

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
 *
 * The handle is createLeadSearch in src/server/leads/lead-search-create.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_search",
  spend: true,
  // A refusal here is about finding leads, not about buying a number.
  spendWords: SPEND_LEADS,
  input: CreateSchema,
  handle: ({ ctx, member, input }) => createLeadSearch(ctx, member, input),
});
