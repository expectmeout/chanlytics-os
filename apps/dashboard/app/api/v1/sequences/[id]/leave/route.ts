import { write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { LEAVE_BODY } from "@/server/sequences/bodies";
import { leaveSequenceNow } from "@/server/sequences/doors";

/**
 * POST /api/v1/sequences/:id/leave — { enrollment_ids }: people taken out of a sequence (decision 0060), up to 500 at
 * once. Each still in it leaves, and a send of theirs not yet gone is skipped with them; an id of another sequence is
 * nobody here. Owner or operator; the leave_sequence decision is written in the same transaction (00441 sequence_leave).
 * Answers how many left.
 */
export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "playbook",
  input: LEAVE_BODY,
  handle: ({ ctx, input, row }) => leaveSequenceNow(ctx, row, input),
});
