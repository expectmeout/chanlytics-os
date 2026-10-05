import { write, account } from "@/server/route";
import { declineHandoverOf } from "@/server/workspace/handover-answer";

/**
 * POST /api/v1/handovers/:id/decline — the addressee of a handover says no (decision 0016, 00214 handover_decline).
 * The workspace stays with the partner who set it up, who hears it in their letter and may send it again.
 *
 * The handle is declineHandoverOf in src/server/workspace/handover-answer.ts: the route is its declaration (who may,
 * how often), the verb is what it does.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "handover_answer",
  handle: ({ ctx }) => declineHandoverOf(ctx),
});
