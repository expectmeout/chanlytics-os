/**
 * What the route reads of Ask's answer to New (POST sequences/draft, decision 0065), in zod's classic API: checked in shape
 * before a word of it is judged against the workspace (the server's sequences/draft-judge.ts). Apart from new-draft.ts,
 * which the browser reads, so the page loads none of the classic API.
 */
import { z } from "zod";
import { FOLLOW_UP_CONDITIONS } from "./follow-up";
import { NEW_AUDIENCES, NEW_KINDS, NEW_STEP_DOES } from "./new-draft";

const LONG_WORDS = z.string().max(2000);

export const NewDraftAnswerSchema = z.object({
  kind: z.enum(NEW_KINDS),
  audience: z.enum(NEW_AUDIENCES),
  who: z.string().trim().max(60),
  name: z.string().trim().max(120),
  hour: z.number().int(),
  when: z.string().trim().max(40),
  steps: z
    .array(
      z.object({
        does: z.enum(NEW_STEP_DOES),
        after_days: z.number().int(),
        only_if: z.array(z.enum(FOLLOW_UP_CONDITIONS)).max(FOLLOW_UP_CONDITIONS.length),
        message: z.string().trim().max(10),
        texts: z.array(z.string().max(300)).max(10),
        write: z.object({
          title: z.string().trim().max(80),
          offer: z.boolean(),
          whatsapp: LONG_WORDS,
          email_subject: z.string().max(200),
          email_body: LONG_WORDS,
          text: z.string().max(600),
        }),
        subject: z.string().max(200),
        body: LONG_WORDS,
        words: z.string().max(600),
      }),
    )
    .max(8),
  cannot: z.string().trim().max(300),
});
export type NewDraftAnswer = z.infer<typeof NewDraftAnswerSchema>;
export type NewDraftAnswerStep = NewDraftAnswer["steps"][number];
