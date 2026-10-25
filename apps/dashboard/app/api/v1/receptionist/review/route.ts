import { z } from "zod";
import { SPEND_REVIEW, TRY_IT_MAX_CHARS, TRY_IT_MAX_EXCHANGES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { reviewRehearsal } from "@/server/receptionist/rehearsal";

/**
 * POST /api/v1/receptionist/review — how it did (decision 0069): one conversation judged against what the receptionist
 * was told, each answer Right, Rule, Guessed, Didn't know or Off. Of a rehearsal ({ rehearsal_id }), a real call
 * ({ call_id }), or the typed turns tried ({ turns, config_version }), which are kept as a rehearsal when reviewed. One
 * model answer each, kept on the rehearsal, so a second look costs nothing. Whoever may change the settings may review
 * them; a workspace that may not spend is refused first, and thirty an hour a person.
 */
const Turn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .min(1)
    .max(TRY_IT_MAX_CHARS * 4),
});
const Input = z.union([
  z.object({ rehearsal_id: z.uuid() }).strict(),
  z.object({ call_id: z.uuid() }).strict(),
  z
    .object({
      turns: z
        .array(Turn)
        .min(2)
        .max(TRY_IT_MAX_EXCHANGES * 2),
      config_version: z.number().int().min(1).nullable(),
    })
    .strict(),
]);

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "receptionist_review",
  spend: true,
  spendWords: SPEND_REVIEW,
  input: Input,
  handle: ({ ctx, member, input }) => reviewRehearsal(member.tenantId, ctx.userId, input),
});

export const maxDuration = 60;
