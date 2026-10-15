import { write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { STEP_WORDS_BODY } from "@/server/sequences/bodies";
import { changeSequenceWords } from "@/server/sequences/doors";

/**
 * POST /api/v1/sequences/:id/steps/:step/words — { template_id, params? }: the message a step sends from now, and the
 * values its slots take, judged against it (decision 0060). At once where the step does not go by WhatsApp or the
 * message's WhatsApp version is approved; else the new words and their values wait for WhatsApp while the step sends its
 * own, and take their place when WhatsApp approves them (`waits`). Owner or operator; the change_step decision is written
 * in the same transaction (00441 sequence_step_words).
 */
export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "playbook",
  input: STEP_WORDS_BODY,
  handle: ({ ctx, input, row }) => changeSequenceWords(ctx, row, String(ctx.params.step ?? ""), input),
});
