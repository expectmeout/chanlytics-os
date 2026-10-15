/**
 * What the route reads of a sequence's draft (POST sequences/draft), in zod's classic API: the model's answer, checked in
 * shape before a word of it is judged against the workspace (the server's sequences/draft.ts). Apart from
 * sequence-draft.ts, which the browser reads, so the page loads none of the classic API.
 */
import { z } from "zod";
import { FOLLOW_UP_CONDITIONS } from "./follow-up";
import { SEQUENCE_DRAFT_THEN_MAX } from "./sequence-draft";

const TEXTS = z.array(z.string().max(300)).max(10);

export const SequenceDraftAnswerSchema = z.object({
  name: z.string().trim().max(80),
  moment: z.string().trim().max(40),
  hour: z.number().int(),
  first: z.object({ message: z.string().trim().max(10), texts: TEXTS }),
  then: z
    .array(
      z.object({
        name: z.string().trim().max(80),
        after_days: z.number().int(),
        only_if: z.array(z.enum(FOLLOW_UP_CONDITIONS)).max(FOLLOW_UP_CONDITIONS.length),
        message: z.string().trim().max(10),
        texts: TEXTS,
      }),
    )
    .max(SEQUENCE_DRAFT_THEN_MAX + 2),
  cannot: z.string().trim().max(300),
});
export type SequenceDraftAnswer = z.infer<typeof SequenceDraftAnswerSchema>;
