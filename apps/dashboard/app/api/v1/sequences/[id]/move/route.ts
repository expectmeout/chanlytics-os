import { write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { MOVE_BODY } from "@/server/sequences/bodies";
import { moveToSequenceNow } from "@/server/sequences/doors";

/**
 * POST /api/v1/sequences/:id/move — { lead_id }: a lead nothing was sent to, out of the sequence it stands in and into
 * this one (00459 sequence_move): its place there leaves as moved, its first send skipped so, and the add door takes it
 * here. One written to stays where it is (409: a business gets one sequence). Owner or operator; the leave's decision is
 * written in the same transaction. Answers the sequence it left and this one; moving it back is the undo.
 */
export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "lead_member",
  input: MOVE_BODY,
  handle: ({ ctx, input, row }) => moveToSequenceNow(ctx, row, input),
});
