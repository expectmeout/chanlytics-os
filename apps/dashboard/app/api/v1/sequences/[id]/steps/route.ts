import { write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { NEW_STEP_BODY } from "@/server/sequences/bodies";
import { addSequenceStep } from "@/server/sequences/doors";

/**
 * POST /api/v1/sequences/:id/steps — { after_days, template_id, only_if?, channels?, name?, params? }: a customer's step
 * after the last (decision 0060, D6), sent `after_days` (1 to 90) after the one before it, to whoever still meets
 * `only_if` (no_booking, no_reply), under the first step's class, hour and cap. The message is the workspace's own, named
 * as its row names it. Owner or operator; the change_step decision is written in the same transaction (00442
 * sequence_step_save). Answers the step's id and place.
 */
export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "playbook",
  input: NEW_STEP_BODY,
  handle: ({ ctx, input, row }) => addSequenceStep(ctx, row, input),
});
