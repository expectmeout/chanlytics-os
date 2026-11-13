/**
 * What the route reads of Ask's answer to New (POST sequences/draft, decision 0065), in zod's classic API: checked in shape
 * before a word of it is judged against the workspace (the server's campaigns/sequences/draft-judge.ts). Apart from new-draft.ts,
 * which the browser reads, so the page loads none of the classic API.
 *
 * A name, a written message's title and what Ask says it left out carry no length here: the model is asked for them in a
 * JSON schema that can hold it to none, so one that runs long is the judge's to cut, never a reason to lose the draft
 * (the live run of 13 Nov 2026: a note past 300 characters came back as "unreadable").
 */
import { z } from "zod";
import { FOLLOW_UP_CONDITIONS } from "./follow-up";
import { NEW_AUDIENCES, NEW_KINDS, NEW_STEP_DOES } from "./new-draft/steps";

const LONG_WORDS = z.string().max(2000);

export const NewDraftAnswerSchema = z.object({
  kind: z.enum(NEW_KINDS),
  audience: z.enum(NEW_AUDIENCES),
  who: z.string().trim().max(60),
  name: z.string().trim(),
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
          title: z.string().trim(),
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
  cannot: z.string().trim(),
});
export type NewDraftAnswer = z.infer<typeof NewDraftAnswerSchema>;
export type NewDraftAnswerStep = NewDraftAnswer["steps"][number];
