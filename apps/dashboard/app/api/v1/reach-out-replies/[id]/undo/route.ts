import { write } from "@/server/route";
import { reachOutReplyScope } from "@/server/verbs";
import { undoReading } from "@/server/campaigns/reach-out-replies";

/**
 * POST /api/v1/reach-out-replies/:id/undo — "read as no · undo" (Reach out Part 5, G10, N4): the reply's door puts back
 * exactly what the no wrote, for seven days, while nothing since holds it (00222 reach_out_reply_undo). The reading is
 * the row (reachOutReplyScope), keyed by its message, so the role is judged where it lives. Owner or operator; each
 * refusal is the door's reason in contracts' words.
 */
export const POST = write({
  scope: reachOutReplyScope,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, row }) => undoReading(ctx, row.id),
});
