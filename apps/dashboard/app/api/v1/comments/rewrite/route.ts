import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { readerContext } from "@/server/shared/reader";
import { rewriteCommentAnswer } from "@/server/content/comment-rewrite";

/** A model call that reads the comment and its post first: the platform's ceiling, as the other drafts' own. */
export const maxDuration = 60;

/**
 * POST /api/v1/comments/rewrite — { touch_id, words, change } → { draft, cannot_why }: a comment's public answer written
 * again as its owner asks ("Tell AI what to change"), held to the rule a draft is held to. Words handed back for the
 * box, never kept: the owner's Send posts what the box holds. Owner or operator; counted against the workspace's AI
 * budget like any other draft.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  input: z.strictObject({
    touch_id: z.uuid(),
    words: z.string().max(2200),
    change: z.string().trim().min(1).max(500),
  }),
  handle: ({ ctx, member, input }) => rewriteCommentAnswer(readerContext(ctx, member), input),
});
