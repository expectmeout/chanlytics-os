import { write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { STEP_TEST_BODY } from "@/server/sequences/bodies";
import { sendStepTest } from "@/server/sequences/test-mail";

/**
 * POST /api/v1/sequences/:id/steps/:step/test — Send me a test: the step's message, filled for an example person (a lead's
 * step: for `lead_id`, one lead in it, else an example business), mailed to the member who pressed it at their own
 * sign-in address, and to nobody else (the parity review's W5; the lead-to-sequence canvas's preview). Answers the address
 * it went to. Owner or operator, ten an hour; refused in words where providers are not live, the member has no address,
 * the message lacks a version the step goes by, or a lead's email has no words yet.
 */
export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "step_test",
  input: STEP_TEST_BODY,
  handle: ({ ctx, row, input }) => sendStepTest(ctx, row, String(ctx.params.step ?? ""), input.lead_id ?? null),
});
