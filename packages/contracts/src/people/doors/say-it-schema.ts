/**
 * What POST people/[id]/say parses (say-it.ts says the rest): the line a member said and which sheet it fills, and the
 * model's answer for each sheet, read before any of it is kept. Classic zod, the route's: a page never loads it.
 */
import { z } from "zod";
import { SAY_IT_MAX, SAY_IT_VERBS, type SayItDealAnswer, type SayItNoteAnswer } from "./say-it";

/** What the door takes: which sheet, and what was said. */
export const SayItInputSchema = z
  .object({
    verb: z.enum(SAY_IT_VERBS),
    words: z.string().trim().min(1, "Say what happened first.").max(SAY_IT_MAX, `At most ${SAY_IT_MAX} characters.`),
  })
  .strict();
export type SayItInput = z.infer<typeof SayItInputSchema>;

/** The model's answer for a deal, read: every field a string, "" where nothing was said. */
export const SayItDealAnswerSchema: z.ZodType<SayItDealAnswer> = z.object({
  service: z.string(),
  value: z.string(),
  per: z.string(),
  link: z.string(),
  valid_until: z.string(),
  lost_reason: z.string(),
  note: z.string(),
});

/** The model's answer for a note, read. */
export const SayItNoteAnswerSchema: z.ZodType<SayItNoteAnswer> = z.object({
  body: z.string(),
  day: z.string(),
  team_only: z.boolean(),
});
