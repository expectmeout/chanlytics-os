import { write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { STEP_CHANGE_BODY } from "@/server/sequences/bodies";
import { changeSequenceStep, dropSequenceStep } from "@/server/sequences/doors";

/**
 * One step after the first of a customer's sequence (decision 0060, D6).
 *
 * PUT    /api/v1/sequences/:id/steps/:step — any of { after_days, only_if, channels, name, params }, changed in place;
 *        answers what each held (`was`).
 * DELETE /api/v1/sequences/:id/steps/:step — the step goes, with the steps after it; whoever waited for it has had what
 *        is left of the sequence. Never the first step, which is the sequence.
 *
 * Owner or operator; the sequence is the row (sequenceScope), the step is found inside it by its door, and the
 * change_step decision is written in the same transaction (00442).
 */
export const PUT = write({
  scope: sequenceScope,
  role: "operator",
  rate: "playbook",
  input: STEP_CHANGE_BODY,
  handle: ({ ctx, input, row }) => changeSequenceStep(ctx, row, String(ctx.params.step ?? ""), input),
});

export const DELETE = write({
  scope: sequenceScope,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, row }) => dropSequenceStep(ctx, row, String(ctx.params.step ?? "")),
});
