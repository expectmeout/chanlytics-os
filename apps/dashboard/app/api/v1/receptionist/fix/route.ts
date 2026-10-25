import { z } from "zod";
import { FIX_KINDS, SPEND_REVIEW } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { routeRehearsalFix } from "@/server/receptionist/rehearsal";

/**
 * POST /api/v1/receptionist/fix — where a correction goes (decision 0069, R4): the owner's words under an answer routed
 * to one settings change, by the words where they decide it, else one small model answer. Nothing is written: the change
 * and its line come back for the owner to Keep (POST receptionist/keep). The review's role, spend and rate.
 */
const Input = z
  .object({
    kind: z.enum(FIX_KINDS),
    words: z.string().trim().max(2000),
    customer: z.string().max(2000),
    answer: z.string().max(4000),
    rule: z.string().max(2000).nullable(),
  })
  .strict();

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "receptionist_review",
  spend: true,
  spendWords: SPEND_REVIEW,
  input: Input,
  handle: ({ ctx, member, input }) => routeRehearsalFix(member.tenantId, ctx.userId, input),
});
