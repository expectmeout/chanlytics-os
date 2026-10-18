import { z } from "zod";
import { SPEND_TRY, TRY_IT_MAX_CHARS, TRY_IT_MAX_EXCHANGES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { tryReceptionist } from "@/server/receptionist/try";

/**
 * POST /api/v1/receptionist/try — Settings › How it answers, Try it: a message written as a customer would, answered by
 * the receptionist as it stands, with why it answered so and what the live turn would then do. Nothing is sent and
 * nothing is written (the edge's eval door, server/receptionist/try.ts). Body: { text, history? } where history is the
 * turns tried before it, up to six exchanges. Whoever may change these settings may try them; it spends a model answer
 * each, so a workspace that may not spend is refused before anything is asked, and thirty an hour a person.
 */
const Turn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .min(1)
    .max(TRY_IT_MAX_CHARS * 4),
});
const Input = z.object({
  text: z.string().trim().min(1).max(TRY_IT_MAX_CHARS),
  history: z
    .array(Turn)
    .max(TRY_IT_MAX_EXCHANGES * 2)
    .optional(),
});

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "receptionist_try",
  spend: true,
  spendWords: SPEND_TRY,
  input: Input,
  handle: ({ ctx, member, input }) => tryReceptionist(member.tenantId, ctx.userId, input.text, input.history ?? []),
});

export const maxDuration = 60;
