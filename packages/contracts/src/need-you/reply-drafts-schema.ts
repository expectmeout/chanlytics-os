/**
 * What the drafts' routes parse (zod), kept apart from reply-drafts.ts so the browser's bundle of contracts holds no zod
 * for them: POST conversations/[id]/draft takes the kind to write, and GET conversations/drafts the threads to read.
 */
import { z } from "zod";
import { REPLY_DRAFT_KINDS } from "./reply-drafts";

/**
 * The longest change a member asks of Ask's draft in their own words ("Say the trial can be on a Sunday too"): long enough
 * to say aloud (9 Nov 2026), which runs longer than anyone types.
 */
export const REPLY_DRAFT_INSTRUCTION_MAX = 1000;

/** The longest words a change is asked of: what stands on the member's screen, a long email's reply among them. */
export const REPLY_DRAFT_GIVEN_MAX = 8000;

/**
 * POST conversations/[id]/draft: which draft to write for the thread, a reply or a call's brief; with `instruction`, the
 * kept one written again as the member asks, and with `given` the words on their screen, which may not be the kept ones
 * (what they typed, a reply that never reached them).
 */
export const ReplyDraftAskSchema = z
  .object({
    kind: z.enum(REPLY_DRAFT_KINDS),
    instruction: z.string().trim().min(1).max(REPLY_DRAFT_INSTRUCTION_MAX).optional(),
    given: z.string().trim().min(1).max(REPLY_DRAFT_GIVEN_MAX).optional(),
  })
  .strict();
export type ReplyDraftAsk = z.infer<typeof ReplyDraftAskSchema>;

/** POST google/reviews/[id]/draft: Ask's reply to a review, with what the member said to put in it and the words it changes. */
export const ReviewDraftAskSchema = z
  .object({
    instruction: z.string().trim().min(1).max(REPLY_DRAFT_INSTRUCTION_MAX).optional(),
    given: z.string().trim().min(1).max(REPLY_DRAFT_GIVEN_MAX).optional(),
  })
  .strict();

/** GET conversations/drafts: the threads whose kept drafts to read, comma-separated; none, the workspace's newest. */
export const ReplyDraftsQuerySchema = z.object({ ids: z.string().min(1).optional() }).strict();
