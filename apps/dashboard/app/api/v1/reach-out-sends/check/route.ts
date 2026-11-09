import { ReachOutCheckSchema, type ReachOutOpeningDto } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { checkOpeningsNow, streamOpeningsNow } from "@/server/campaigns/sequences/opening";

/** A press waits for its check (server/campaigns/sequences/opening.ts CHECK_NOW_MS), and the openings are read after it. */
export const maxDuration = 30;

/**
 * POST /api/v1/reach-out-sends/check — { send_ids, stream? } → { sends }: the emails a member pressed Rewrite the opening
 * on, written now by the edge's check rather than on its clock's next minute (00505), and the openings they stand with
 * after: written or still being written, held or not, paused, and whether Undo can put the earlier one back. With
 * `stream`, a stream of JSON lines: each step the check takes as it takes it ({t: "step"}), then the answer ({t:
 * "done"}). The withRoute envelope is for JSON; a stream is returned as-is, as Ask's turn is. Another workspace's email
 * is neither checked (the edge acts for the workspace its token names) nor read. It spends the model, so a workspace that
 * may not spend is refused first. Owner or operator.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "playbook",
  spend: true,
  input: ReachOutCheckSchema,
  handle: async ({ ctx, member, input, req }): Promise<{ sends: ReachOutOpeningDto[] } | Response> =>
    input.stream
      ? streamOpeningsNow(ctx, member.tenantId, input.send_ids, req.signal)
      : checkOpeningsNow(ctx, member.tenantId, input.send_ids),
});
