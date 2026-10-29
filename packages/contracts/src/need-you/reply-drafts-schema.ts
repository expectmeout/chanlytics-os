/**
 * What the drafts' routes parse (zod), kept apart from reply-drafts.ts so the browser's bundle of contracts holds no zod
 * for them: POST conversations/[id]/draft takes the kind to write, and GET conversations/drafts the threads to read.
 */
import { z } from "zod";
import { REPLY_DRAFT_KINDS } from "./reply-drafts";

/** The longest change a member asks of Ask's draft in their own words ("Say the trial can be on a Sunday too"). */
export const REPLY_DRAFT_INSTRUCTION_MAX = 280;

/**
 * POST conversations/[id]/draft: which draft to write for the thread, a reply or a call's brief; with `instruction`, the
 * kept one written again as the member asks (Change it with Ask on Ask's own draft, the phone canvas, 28 Oct 2026).
 */
export const ReplyDraftAskSchema = z
  .object({
    kind: z.enum(REPLY_DRAFT_KINDS),
    instruction: z.string().trim().min(1).max(REPLY_DRAFT_INSTRUCTION_MAX).optional(),
  })
  .strict();
export type ReplyDraftAsk = z.infer<typeof ReplyDraftAskSchema>;

/** GET conversations/drafts: the threads whose kept drafts to read, comma-separated; none, the workspace's newest. */
export const ReplyDraftsQuerySchema = z.object({ ids: z.string().min(1).optional() }).strict();
