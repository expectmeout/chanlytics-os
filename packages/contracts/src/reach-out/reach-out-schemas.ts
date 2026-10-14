/**
 * Reach out's schemas: a chain and its steps, a preview and a decision, the replies' query, as the routes read them,
 * apart from the words of reach-out-words.ts, reach-out-dtos.ts and reach-out-reply-words.ts, which the pages read.
 * zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that says these words
 * loads none of it.
 */
import { z } from "zod";
import {
  REACH_OUT_SUBJECT_MAX,
  REACH_OUT_BODY_MAX,
  REACH_OUT_AFTER_DAYS,
  REACH_OUT_NAME_MAX,
  REACH_OUT_GAP_MINUTES,
  REACH_OUT_MAILBOXES_MAX,
  SIGNED_BY_MAX,
  REACH_OUT_STEPS_MAX,
} from "./reach-out-words";
import { HAND_KINDS, HAND_WORDS_MAX } from "./reach-out-hand";
import { REACH_OUT_PREVIEW_INDEX_MAX, REACH_OUT_DECISIONS, REACH_OUT_SAID_OUTCOMES } from "./reach-out-dtos";
import { OWNER_SAID_INTENTS } from "./reach-out-replies";
import { LEAD_LIST_MAX } from "../leads/lead-import";

/** GET reach-out-replies: since when (at most the reading's window back), and one thread's alone. */
export const ReachOutRepliesQuerySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  conversation_id: z.string().uuid().optional(),
});

export type ReachOutRepliesQuery = z.infer<typeof ReachOutRepliesQuerySchema>;

export const ReachOutStepSchema = z.object({
  /** An existing step's id, when the sheet edits a chain; none for a new one. */
  id: z.string().uuid().nullable().optional(),
  subject: z
    .string()
    .max(REACH_OUT_SUBJECT_MAX * 2)
    .nullable(),
  body: z.string().max(REACH_OUT_BODY_MAX * 2),
  after_days: z.number().int().min(REACH_OUT_AFTER_DAYS.min).max(REACH_OUT_AFTER_DAYS.max).nullable(),
  /** A call or a note for the team instead of an email (Part 5, G20): the chain's last step only. */
  hand: z
    .object({ kind: z.enum(HAND_KINDS), words: z.string().max(HAND_WORDS_MAX * 2) })
    .nullable()
    .optional(),
});

export const ReachOutChainSchema = z.object({
  name: z.string().trim().min(1).max(REACH_OUT_NAME_MAX),
  search_id: z.string().uuid(),
  include_unconfirmed: z.boolean(),
  /** One of the sheet's paces: the database's CHECK holds the same set (00211). */
  gap_minutes: z
    .number()
    .int()
    .refine((g) => (REACH_OUT_GAP_MINUTES as readonly number[]).includes(g), {
      message: `One of ${REACH_OUT_GAP_MINUTES.join(", ")} minutes.`,
    }),
  /** Empty: every connected mailbox of the workspace (00424). */
  mailbox_ids: z.array(z.string().uuid()).max(REACH_OUT_MAILBOXES_MAX),
  /** Its owner sends its emails from their own inbox, each handed to them written and checked (00429). */
  owner_sends: z.boolean().default(false),
  signed_by: z.string().trim().max(SIGNED_BY_MAX).nullable(),
  steps: z.array(ReachOutStepSchema).min(1).max(REACH_OUT_STEPS_MAX),
});

export type ReachOutChainInput = z.infer<typeof ReachOutChainSchema>;

/** What the sheet's preview asks: the n-th business of a search, with the first step's words as they stand. */
export const ReachOutPreviewSchema = z.object({
  search_id: z.string().uuid(),
  index: z.number().int().min(0).max(REACH_OUT_PREVIEW_INDEX_MAX),
  include_unconfirmed: z.boolean(),
  words: z.object({
    subject: z
      .string()
      .max(REACH_OUT_SUBJECT_MAX * 2)
      .nullable(),
    body: z
      .string()
      .trim()
      .min(1)
      .max(REACH_OUT_BODY_MAX * 2),
  }),
  signed_by: z.string().trim().max(SIGNED_BY_MAX).nullable(),
  language: z
    .string()
    .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/)
    .optional(),
});

export type ReachOutPreviewInput = z.infer<typeof ReachOutPreviewSchema>;

export const ReachOutDecideSchema = z.object({ decision: z.enum(REACH_OUT_DECISIONS) });

/** POST reach-out-sends/:id/said (00429): the owner's word on an email handed to them, that it went or did not. */
export const ReachOutSaidSchema = z.object({ outcome: z.enum(REACH_OUT_SAID_OUTCOMES) });

/**
 * POST reach-outs/leads/:id/said (00429): what the business wrote back to an email its owner sent, as the owner says it:
 * the intent, the day they named for not now, and who to write to instead for a wrong person.
 */
export const ReachOutReplySaidSchema = z.object({
  intent: z.enum(OWNER_SAID_INTENTS),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  refer_to: z.string().trim().max(120).nullable().optional(),
});
export type ReachOutReplySaidInput = z.infer<typeof ReachOutReplySaidSchema>;

/** POST reach-outs/:id/leads and its check (00426): the leads to add, as many as a list takes. */
export const ReachOutAddSchema = z.object({
  lead_ids: z.array(z.uuid()).min(1).max(LEAD_LIST_MAX),
});
export type ReachOutAddInput = z.infer<typeof ReachOutAddSchema>;
