/**
 * A reach-out's replies as the dashboard is told them (Reach out Part 5, PR 6): one reading per row, what it did, the
 * receptionist's draft, whether the member may undo it, and the address an answer to it goes out from. The undo's
 * refusals are the words its door says (00222 reach_out_reply_undo), named here once so the page and the route agree.
 */
import { z } from "zod";
import type { ReplyClaim, ReplyIntent, Unread } from "./reach-out-replies";
import type { DraftWhy } from "./reach-out-reply-draft";

/** The most readings one page is told, and how far back it looks (the reading's own window, REACH_OUT_REPLY_DAYS). */
export const REPLIES_PAGE = 200;

/** Why a reading cannot be undone (00222 reach_out_reply_undoable), and the words each is said in. */
export const REPLY_UNDO_REFUSALS = {
  not_found: "Reply not found.",
  role: "Not allowed to act in this workspace.",
  not_a_no: "Only a no can be undone.",
  already: "Already undone.",
  too_late: "It's been more than seven days.",
  moved: "They unsubscribed since, and that stays.",
} as const;
export type ReplyUndoRefusal = keyof typeof REPLY_UNDO_REFUSALS;
export const isReplyUndoRefusal = (v: unknown): v is ReplyUndoRefusal =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(REPLY_UNDO_REFUSALS, v);

/**
 * Where a person's answer to a reach-out's reply goes out from (C15, N5): the reach-out's own address when its domain
 * is verified now; otherwise the mailbox, and why (the domain held, or removed). `because` is null when the thread
 * answers no reach-out at all, which is every other email reply.
 */
export type ReplyFrom =
  { from: "own"; address: string } | { from: "mailbox"; because: "domain_held" | "domain_removed" | null };

/** One reading as the Inbox and Today read it. */
export interface ReachOutReplyDto {
  message_id: string;
  conversation_id: string;
  read_at: string;
  intent: ReplyIntent;
  claim: ReplyClaim;
  summary: string | null;
  /** The day they named (not now, their own away), as the business's calendar has it. */
  named_day: string | null;
  refer_to: string | null;
  /** Why it could not be read yet; null once it was. */
  unread: Unread | null;
  /** Whether a later read replaced what the first could not read. */
  reread: boolean;
  undone: boolean;
  /** The door's own test (reach_out_reply_undoable), asked of each no that may still be undone. */
  can_undo: boolean;
  draft: string | null;
  draft_state: "none" | "waiting" | "written" | "not_written";
  draft_why: DraftWhy | null;
  business: string | null;
  chain: string | null;
  /** The step it answers, 1 for the chain's first email. */
  step: number | null;
  reply_from: ReplyFrom;
}

/** GET reach-out-replies: since when (at most the reading's window back), and one thread's alone. */
export const ReachOutRepliesQuerySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  conversation_id: z.string().uuid().optional(),
});
export type ReachOutRepliesQuery = z.infer<typeof ReachOutRepliesQuerySchema>;
