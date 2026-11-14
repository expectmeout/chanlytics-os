/**
 * What the route reads of Ask's answer to New (POST sequences/draft, decision 0065), in zod's classic API: checked in shape
 * before a word of it is judged against the workspace (the server's campaigns/sequences/draft-judge.ts). Apart from new-draft.ts,
 * which the browser reads, so the page loads none of the classic API.
 *
 * Its types and its closed sets, and never a length or a count: the model is asked for it in a JSON schema that can hold
 * it to none (NEW_DRAFT_JSON_SCHEMA), so a part that runs long, or more steps than a draft holds, is the judge's to hold
 * where the part is used (a key that names nothing, a time it cannot read, a typed value, a call's words, a step past the
 * most, and each message's words by the door that files them), never a reason to lose the draft. The live run of 13 Nov
 * 2026: a note past 300 characters came back as "unreadable"; who said in words past 60, or a when past 40, would too.
 */
import { z } from "zod";
import { FOLLOW_UP_CONDITIONS } from "./follow-up";
import { NEW_AUDIENCES, NEW_KINDS, NEW_STEP_DOES } from "./new-draft/steps";

export const NewDraftAnswerSchema = z.object({
  kind: z.enum(NEW_KINDS),
  audience: z.enum(NEW_AUDIENCES),
  who: z.string().trim(),
  name: z.string().trim(),
  hour: z.number().int(),
  when: z.string().trim(),
  steps: z.array(
    z.object({
      does: z.enum(NEW_STEP_DOES),
      after_days: z.number().int(),
      only_if: z.array(z.enum(FOLLOW_UP_CONDITIONS)),
      message: z.string().trim(),
      texts: z.array(z.string()),
      write: z.object({
        title: z.string().trim(),
        offer: z.boolean(),
        whatsapp: z.string(),
        email_subject: z.string(),
        email_body: z.string(),
        text: z.string(),
      }),
      subject: z.string(),
      body: z.string(),
      words: z.string(),
    }),
  ),
  cannot: z.string().trim(),
});
export type NewDraftAnswer = z.infer<typeof NewDraftAnswerSchema>;
export type NewDraftAnswerStep = NewDraftAnswer["steps"][number];
