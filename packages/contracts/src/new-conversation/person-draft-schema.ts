/**
 * What the new conversation's routes parse (zod): the plan handed to Ask, what the model must answer, and the send.
 * Kept apart from person-draft.ts so the browser's bundle of contracts holds no zod for it.
 */
import { z } from "zod";
import { REPLY_MAX_ANY } from "../config/policy";
import { CONSENT_CHANNELS } from "../consent/consent-channels";
import {
  DRAFT_ABOUT_MAX,
  DRAFT_ANSWER_MAX,
  DRAFT_ASKS_MAX,
  DRAFT_HOWS,
  DRAFT_TONES,
  PLAN_NOTE_MAX,
} from "./person-draft";

/** POST people/[id]/draft takes: message or call, the wire for a message, the plan, and what was asked and answered. */
export const PersonDraftInputSchema = z
  .object({
    how: z.enum(DRAFT_HOWS),
    wire: z.enum(CONSENT_CHANNELS).optional(),
    about: z.string().trim().min(1, "Say what it is about.").max(DRAFT_ABOUT_MAX),
    answers: z
      .array(
        z
          .object({
            key: z.string().min(1).max(40),
            question: z.string().max(200),
            words: z.string().trim().min(1).max(DRAFT_ANSWER_MAX),
          })
          .strict(),
      )
      .max(DRAFT_ASKS_MAX)
      .optional(),
    previous: z
      .object({ text: z.string().max(4000), subject: z.string().max(200).optional() })
      .strict()
      .optional(),
    tone: z.enum(DRAFT_TONES).optional(),
  })
  .strict();
export type PersonDraftInput = z.infer<typeof PersonDraftInputSchema>;

/** What the model answered, held to lengths a JSON schema cannot say. */
export const PersonDraftAnswerSchema = z.object({
  asks: z
    .array(z.object({ key: z.string().trim().min(1).max(40), question: z.string().trim().min(3).max(200) }))
    .max(4),
  text: z.string().trim().max(4000),
  subject: z.string().trim().max(200),
  note: z.string().trim().max(600),
  opening: z.string().trim().max(400),
  points: z.array(z.string().trim().max(300)).max(6),
  avoid: z.array(z.string().trim().max(300)).max(6),
  ask: z.string().trim().max(300),
});
export type PersonDraftAnswer = z.infer<typeof PersonDraftAnswerSchema>;

/**
 * POST people/[id]/message takes: the wire the member chose, the words or the approved message, a subject for an email,
 * who answers, and the plan as the note the receptionist reads (kept by the verb once the message is queued, before
 * the thread is handed back). `wire` and `then` are required: a first message guesses neither.
 */
export const PersonMessageBodySchema = z
  .object({
    wire: z.enum(CONSENT_CHANNELS),
    text: z.string().max(REPLY_MAX_ANY, "That message is longer than any channel can carry.").optional(),
    subject: z.string().trim().min(1).max(200).optional(),
    template: z
      .object({ name: z.string().min(1).max(512), language: z.string().min(2).max(15) })
      .strict()
      .optional(),
    email_to: z.string().max(320).optional(),
    then: z.enum(["receptionist", "me"]),
    note: z.string().trim().min(1).max(PLAN_NOTE_MAX).optional(),
  })
  .strict();
export type PersonMessageBody = z.infer<typeof PersonMessageBodySchema>;
