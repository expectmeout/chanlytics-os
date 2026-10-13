import { z } from "zod";
import { read } from "@/server/route";
import { reachOutScope } from "@/server/verbs";
import { chainPeopleOf } from "@/server/leads/lead-workbench";

/**
 * GET /api/v1/reach-outs/:id/people — who is in a reach-out, as its drawer lists them (00423 reach_out_chain_people):
 * waiting (on its list, or in its search's audience, nothing left for them yet), writing (written to, not done) and
 * done (booked, stopped, bounced, said no, closed, or a person answered), each a lead's line as Leads reads it, at most
 * `limit` of each, with their counts and whether more can be added (a list) or its search keeps it current. Any member.
 */
export const GET = read({
  scope: reachOutScope,
  query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
  handle: ({ ctx, member, row, input }) => chainPeopleOf(ctx, member.tenantId, row.id, input.limit),
});
