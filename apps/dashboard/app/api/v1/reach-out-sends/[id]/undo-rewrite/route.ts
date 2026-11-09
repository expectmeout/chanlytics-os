import { z } from "zod";
import { write } from "@/server/shared/route";
import { reachOutSendScope } from "@/server/shared/verbs";
import { undoOpening } from "@/server/campaigns/sequences/opening";

/**
 * POST /api/v1/reach-out-sends/:id/undo-rewrite — Undo of Rewrite the opening (00505 reach_out_send_rewrite_undo): the
 * opening the rewrite replaced, and how it stood (its reading, and held or waiting), back while the email waits in a live
 * run; a check still writing the rewrite writes nothing. Answers the opening it stands with now. Owner or operator.
 */
export const POST = write({
  scope: reachOutSendScope,
  role: "operator",
  rate: "playbook",
  input: z.object({}).strict(),
  handle: ({ ctx, row }) => undoOpening(ctx, row),
});
