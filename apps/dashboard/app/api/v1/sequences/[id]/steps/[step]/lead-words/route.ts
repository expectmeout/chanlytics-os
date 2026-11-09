import { write } from "@/server/shared/route";
import { sequenceScope } from "@/server/shared/verbs";
import { LEAD_WORDS_BODY } from "@/server/campaigns/sequences/bodies";
import { saveLeadWords } from "@/server/campaigns/sequences/lead-words";

/**
 * POST /api/v1/sequences/:id/steps/:step/lead-words — { lead_id, words }: one lead's own email at this step (decision
 * 0096), typed on their sheet, judged by the rules a step's words are held to; `words` null puts the step's back. Refused
 * in words once that email has gone or is its owner's to send. Answers the words that stood before, for Undo. Owner or
 * operator.
 */
export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "playbook",
  input: LEAD_WORDS_BODY,
  handle: ({ ctx, row, input }) => saveLeadWords(ctx, row, String(ctx.params.step ?? ""), input),
});
