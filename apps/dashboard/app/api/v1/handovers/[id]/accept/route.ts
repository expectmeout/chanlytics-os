import { write, account } from "@/server/route";
import { acceptHandover } from "@chanlytics/db";
import { requireUuid } from "@/server/request-guards";
import { handoverRefusal } from "@/server/workspace/handover";

/**
 * POST /api/v1/handovers/:id/accept — the caller, by the confirmed address a workspace was handed to (decision 0016),
 * becomes its owner (00214 handover_accept): billing, the team, and the partner who set it up beside them on it.
 * Never the partner themselves; never after it was declined or expired. On the account: the caller is not yet a
 * member of the workspace they are accepting.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "handover_answer",
  handle: async ({ ctx }): Promise<{ workspace: { id: string; slug: string; name: string } }> => {
    const r = await acceptHandover(ctx.supabase, requireUuid(ctx.params.id, "workspace"));
    if (!r.ok) throw handoverRefusal(r);
    return { workspace: r.value };
  },
});
