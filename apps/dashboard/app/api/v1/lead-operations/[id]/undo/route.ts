import { z } from "zod";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { answerOf, refusalOf } from "@/server/leads/leads";

const Body = z.object({ version: z.number().int().min(0) });

/**
 * POST /api/v1/lead-operations/:id/undo: Undo is a server record (E9). The
 * client sends the operation's id and the version it saw; the door restores
 * `before` and refuses when anyone changed the rows since. An operator's
 * (00423): the door itself says whose act it is to take back (an add, a later,
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
    const { data, error } = await ctx.supabase.rpc("lead_undo", { p_op_id: opId, p_version: input.version });
    if (error) throw new Error(`lead_undo: ${error.message}`);
    const a = answerOf(data);
    const refused = refusalOf(a);
    if (refused) throw refused;
    return {
      op_id: opId,
      undone: true,
      ...(typeof a.taken === "number" ? { taken: a.taken, leaving: a.leaving ?? 0, sent: a.sent ?? 0 } : {}),
    };
  },
});
