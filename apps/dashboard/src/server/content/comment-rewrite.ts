import "server-only";

/**
 * A comment's public answer written again as its owner asks (POST comments/rewrite; the journey canvas's Results board,
 * cell 2, "Tell AI what to change", approved by Ruben on 23 Nov 2026): the comment, its post and the business read on
 * the member's own session, then one model call (comment-rewrite-from.ts). What the owner typed, here or in the box, is
 * theirs to say; a price or an offer of money only the model brought makes no answer, and says why. Words handed back for
 * the box, never kept: the owner's Send posts what the box holds.
 */
import { AppError } from "@chanlytics/contracts";
import { findComment, readAnswerFacts, readCommentPosts } from "@chanlytics/db/content";
import type { ReaderContext } from "../shared/reader";
import { rewriteCommentFrom, type CommentRewriteAsk, type CommentRewritten } from "./comment-rewrite-from";

const COMMENT_GONE = "That comment is not here any more.";

/** The route's handle: the comment, its post and the business read on the member's own session, then the rewrite. */
export async function rewriteCommentAnswer(rc: ReaderContext, ask: CommentRewriteAsk): Promise<CommentRewritten> {
  const db = rc.ctx.supabase;
  const comment = await findComment(db, rc.tenantId, ask.touch_id);
  if (!comment) throw new AppError("not_found", COMMENT_GONE, 404);
  const [[post], facts] = await Promise.all([
    readCommentPosts(db, rc.tenantId, [comment.postId]),
    readAnswerFacts(db, rc.tenantId, new Date()),
  ]);
  if (!post) throw new AppError("not_found", COMMENT_GONE, 404);
  return rewriteCommentFrom(
    {
      facts,
      comment: { words: comment.words, username: comment.username, postKind: post.kind, caption: post.caption },
    },
    ask,
    { tenantId: rc.tenantId, userId: rc.userId },
  );
}
