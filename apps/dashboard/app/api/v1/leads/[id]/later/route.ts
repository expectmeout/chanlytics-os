import { z } from "zod";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { laterLead } from "@/server/leads/lead-workbench";

const Body = z.object({ search_id: z.uuid() });

/**
 * POST /api/v1/leads/:id/later — Later, in a pass of the pile (00423 lead_member_later): the lead is put off in this
 * search; nothing is written to it and its stage does not move, and the pile brings it back at the end. An operator's;
 * the answer carries its undo, which is the operator's own (lead_undo).
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "lead_member",
  input: Body,
  handle: ({ ctx, input }) => laterLead(ctx, requireUuid(ctx.params.id, "lead"), input.search_id),
});
