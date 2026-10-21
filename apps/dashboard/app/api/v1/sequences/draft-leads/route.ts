import { write, workspace } from "@/server/route";
import { readerContext } from "@/server/readers";
import { DRAFT_LEADS_BODY } from "@/server/sequences/bodies";
import { draftLeadSteps } from "@/server/sequences/draft-leads";

/**
 * POST /api/v1/sequences/draft-leads — { name, search_id }: Ask's draft of a sequence to leads' emails (00459, New's "A
 * draft by Ask"): the first email and a follow-up in the reach-out's own words, from the workspace, its goal and the
 * search the leads came from, each judged as every email is; a call or a note is the owner's to add. Nothing is written: New makes
 * the draft with these steps (POST sequences). Owner or operator; one model call, on Ask's budget.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  input: DRAFT_LEADS_BODY,
  handle: ({ ctx, member, input }) => draftLeadSteps(readerContext(ctx, member), input),
});
