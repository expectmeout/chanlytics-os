import { write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { returnToSequenceNow } from "@/server/sequences/doors";

/**
 * POST /api/v1/sequences/:id/return — a leave undone (decision 0060; 00450 sequence_return): the people the leave named
 * by the x-undo-of header took out are put back with their next step, where still out for its reason and nobody of theirs
 * back in since; the sends it skipped stay skipped. Owner or operator; the return_to_sequence decision is written in the
 * same transaction. Answers how many came back and how many sends stay out.
 */
export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, row }) => returnToSequenceNow(ctx, row),
});
