/**
 * Today's rows for comments on the business's posts (00696; the content loop PRD's 12.4: a comment AI cannot answer safely
 * is a point on Today, as a conversation that needs the owner is): one AI could not answer, and one whose answer did not
 * go or was never told, each opened where it is answered, in Inbox. A person waiting on a word, by Need you's order and
 * in its one count, as someone who asked through a form is. A comment with AI's answer ready waits in Inbox's comments,
 * not here; one answered or left is no row. Apart from the queue (queue.ts), as the forms' rows are. Pure.
 */
import { formatWaited } from "../conversations/thread-clock";
import { initialsOf } from "../conversations/thread-contact";
import { commentAddress } from "../content/results/comment-address";
import { COMMENT_POINT_WORDS, commentStageOf, commentWho } from "../content/results/comment-stage";
import type { CommentRowDto } from "../content/results/dtos";
import type { TodayFacts } from "./facts";
import type { TodayQueueRowVM } from "./vm";

/** One comment's row: who, their words, how long ago and on which post, with one door, the comment in Inbox. */
function commentRow(comment: CommentRowDto, todayFacts: TodayFacts): TodayQueueRowVM | null {
  const stage = commentStageOf(comment.answer);
  const status =
    stage === "cannot"
      ? COMMENT_POINT_WORDS.today.status.cannot
      : stage === "failed" || stage === "unknown"
        ? COMMENT_POINT_WORDS.today.status.failed
        : null;
  if (!status) return null;
  const name = commentWho(comment);
  const waitedMs = Math.max(0, todayFacts.now.getTime() - Date.parse(comment.at));
  return {
    id: `q-cm-${comment.touch_id}`,
    kind: "comment",
    conversationId: null,
    callId: null,
    person_id: comment.contact_id,
    who: name,
    initials: initialsOf(name),
    channel: "Instagram",
    via: comment.post.title,
    when: `waited ${formatWaited(waitedMs)}`,
    sentence: comment.words || COMMENT_POINT_WORDS.noWords,
    quoted: !!comment.words,
    status: [status],
    tone: "escalated",
    warn: stage !== "cannot",
    cta: { label: COMMENT_POINT_WORDS.today.open, to: commentAddress(comment.touch_id) },
    also: null,
    waitedMs,
  };
}

/** The comments' rows of a day: each comment AI could not answer, or whose answer did not go. */
export function commentRowsOf(todayFacts: TodayFacts): TodayQueueRowVM[] {
  return todayFacts.comments.flatMap((comment) => commentRow(comment, todayFacts) ?? []);
}
