import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { answerOf, refusalOf } from "@/server/leads/leads";
import { undoLeadAct } from "@/server/leads/search-acts";
import { DbFailure } from "@chanlytics/contracts";

const Body = z.object({ version: z.number().int().min(0) });

/**
 * POST /api/v1/lead-operations/:id/undo: Undo is a server record (E9). The
 * client sends the operation's id and the version it saw; the door restores
 * `before` and refuses when anyone changed the rows since. An operator's
 * (00426): the door itself says whose act it is to take back (an add, a later,
 * a stage or a bulk act its maker's, or find's; keep, exclude and put back
 * find's alone). An add taken back says how many came off its list.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "lead_member",
  input: Body,
  handle: async ({ ctx, input }) => {
    const opId = requireUuid(ctx.params.id, "operation");
    const { data, error } = await undoLeadAct(ctx, { p_op_id: opId, p_version: input.version });
    if (error) throw new DbFailure(error, "lead_undo");
    const answer = answerOf(data);
    const refused = refusalOf(answer);
    if (refused) throw refused;
    return {
      op_id: opId,
      undone: true,
      ...(typeof answer.taken === "number"
        ? { taken: answer.taken, leaving: answer.leaving ?? 0, sent: answer.sent ?? 0 }
        : {}),
    };
  },
});
