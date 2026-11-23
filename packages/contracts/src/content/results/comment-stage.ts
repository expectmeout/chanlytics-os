/**
 * Where a comment's answer stands, and who wrote it (00699): what Today's point on a comment reads of it, and Inbox's
 * words for a comment's row and page build on (apps/dashboard/src/surfaces/inbox/model/comment-said.ts). Apart from
 * those, since the frame draws Need you's count and carries Today's rows: it loads these lines, never Inbox's page. Pure.
 */
import { COMMENT_ANSWER_WORDS } from "./answer-words";
import type { CommentAnswerDto, CommentRowDto } from "./dtos";

/** What a comment's point on Today says, and the two words its row and page in Inbox say too. */
export const COMMENT_POINT_WORDS = {
  someone: "Someone on Instagram",
  noWords: "A comment with no words.",
  today: {
    open: "Open",
    status: { cannot: "AI can't answer it", failed: "Didn't go" },
  },
} as const;

/**
 * Where a comment's answer stands, as its page draws it: none written yet, AI's draft, AI can't answer it, on its way,
 * up, answered in the Instagram app, refused, an outcome nobody told, or left unanswered.
 */
export type CommentStage =
  "none" | "drafted" | "cannot" | "sending" | "sent" | "by_hand" | "failed" | "unknown" | "left";

/** The stage of a comment's answer. An answer that did not go and whose outcome is not known is told apart by its words. */
export function commentStageOf(answer: CommentAnswerDto | null): CommentStage {
  if (!answer) return "none";
  if (answer.state === "sent") return answer.by_hand ? "by_hand" : "sent";
  if (answer.state === "failed") return answer.said === COMMENT_ANSWER_WORDS.unknown ? "unknown" : "failed";
  return answer.state;
}

/** Who wrote it: their name where the person has one, else their handle, else someone. */
export const commentWho = (row: Pick<CommentRowDto, "name" | "username">): string =>
  row.name?.trim() || (row.username ? `@${row.username}` : COMMENT_POINT_WORDS.someone);
