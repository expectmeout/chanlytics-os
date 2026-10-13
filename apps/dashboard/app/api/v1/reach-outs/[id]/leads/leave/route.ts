import { z } from "zod";
import { write } from "@/server/route";
import { reachOutScope } from "@/server/verbs";
import { leaveOut } from "@/server/leads/lead-workbench";

const Body = z.object({ lead_id: z.uuid() });

/**
 * POST /api/v1/reach-outs/:id/leads/leave — Leave out, the drawer's door on a lead waiting in a reach-out fed by a list
 * (00423 reach_out_leave_out), by its first step: off its list, and a send planned or held for it in a live run skipped
 * as taken back. One on its way or sent stays, and the answer says so. An operator's, as the add is; the answer
 * carries its undo (lead_undo).
 */
export const POST = write({
  scope: reachOutScope,
  role: "operator",
  rate: "lead_member",
  input: Body,
  handle: ({ ctx, row, input }) => leaveOut(ctx, row.id, input.lead_id),
});
