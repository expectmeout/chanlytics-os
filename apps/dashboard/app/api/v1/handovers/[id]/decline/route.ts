import { write, account } from "@/server/route";
import { declineHandover } from "@chanlytics/db";
import { requireUuid } from "@/server/request-guards";
import { handoverRefusal } from "@/server/workspace/handover";

/**
 * POST /api/v1/handovers/:id/decline — the addressee of a handover says no (decision 0016, 00214 handover_decline).
 * The workspace stays with the partner who set it up, who hears it in their letter and may send it again.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "handover_answer",
  handle: async ({ ctx }): Promise<{ declined: true }> => {
    const r = await declineHandover(ctx.supabase, requireUuid(ctx.params.id, "workspace"));
    if (!r.ok) throw handoverRefusal(r);
    return { declined: true };
  },
});
