import { LeadsCheckAgainSchema, SPEND_LEADS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { checkAgain } from "@/server/leads/leads";

/**
 * POST /api/v1/leads/check-again — the mailbox check once more, for the leads
 * whose last check did not answer (D3, 00145).
 *
 * The owner alone: it spends, a fraction of a cent an address, so the same
 * billing state a search needs. The door takes only what can be asked again
 * (an address whose last check did not answer, once its search has finished)
 * and says how many it took; none taken is a refusal that says what the act
 * is for.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_bulk",
  spend: true,
  spendWords: SPEND_LEADS,
  input: LeadsCheckAgainSchema,
  handle: ({ ctx, member, input }) => checkAgain(ctx, member.tenantId, input),
});
