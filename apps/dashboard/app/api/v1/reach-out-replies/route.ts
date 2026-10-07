import { ReachOutRepliesQuerySchema } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { listReplies } from "@/server/campaigns/reach-out-replies";

/**
 * GET /api/v1/reach-out-replies — the workspace's readings of replies to its reach-outs (Reach out Part 5): newest
 * first, at most two hundred of the last thirty days, from ?since= and on one thread with ?conversation_id=. Each says
 * what the reply was read as and did, the receptionist's draft, whether this member may undo it (the door's own test),
 * and where an answer to it goes out from. Every member reads it; RLS decides which rows.
 */
export const GET = read({
  scope: workspace,
  query: ReachOutRepliesQuerySchema,
  handle: ({ ctx, member, input }) => listReplies(ctx, member.tenantId, input ?? {}),
});
