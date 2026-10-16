import { write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { sendStepTest } from "@/server/sequences/test-mail";

/**
 * POST /api/v1/sequences/:id/steps/:step/test — Send me a test: the step's message, filled for an example person, mailed
 * to the member who pressed it at their own sign-in address, and to nobody else (the parity review's W5). Answers the
 * address it went to. Owner or operator, ten an hour; refused in words where providers are not live, the member has no
 * address, the sequence is to leads, or the message lacks a version the step goes by.
 */
export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "step_test",
  handle: ({ ctx, row }) => sendStepTest(ctx, row, String(ctx.params.step ?? "")),
});
