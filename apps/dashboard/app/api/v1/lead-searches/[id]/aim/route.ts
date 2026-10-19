import { z } from "zod";
import { UUID } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { aimSearch } from "@/server/leads/lead-workbench";

/**
 * POST /api/v1/lead-searches/:id/aim — { sequence_id }: the sequence this search's Add goes to, or none (null), kept on
 * the search (00459 lead_search_aim), so a desk, a phone and a teammate agree. A sequence to leads of this workspace that
 * has not ended; a member's, as working the search is. Answers the search and its pick.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "lead_member",
  input: z.strictObject({ sequence_id: z.string().regex(UUID, "Which sequence?").nullable() }),
  handle: ({ ctx, member, input }) =>
    aimSearch(ctx, member.tenantId, requireUuid(ctx.params.id, "search"), input.sequence_id),
});
