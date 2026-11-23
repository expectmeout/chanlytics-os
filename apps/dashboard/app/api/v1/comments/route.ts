import { z } from "zod";
import { read, write, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { commentsList } from "@/server/readers/results";
import { sendCommentPress } from "@/server/content/comment-press";

/**
 * GET /api/v1/comments: the comments on the business's posts, newest first, a month back, each naming its post and with
 * its public answer (00692; the content loop PRD's 9.2). Any member. The body is its reader's (readers/results.ts).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), commentsList, undefined)).data,
});

/**
 * POST /api/v1/comments: a press on one comment (00692; the content loop PRD's 12.4, call 27: AI drafts, the owner
 * sends). `send`: the owner's words as the business's public answer, kept as on its way and posted by its job, once; an
 * answer on its way or up is not sent twice. `leave`: left unanswered, no point on Today. `back`: answered after all,
 * with AI's draft back. An owner, an operator or a partner, as a reply in Inbox is.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "reply",
  input: z.discriminatedUnion("act", [
    z.strictObject({ act: z.literal("send"), touch_id: z.uuid(), words: z.string().trim().min(1).max(2200) }),
    z.strictObject({ act: z.literal("leave"), touch_id: z.uuid() }),
    z.strictObject({ act: z.literal("back"), touch_id: z.uuid() }),
  ]),
  handle: ({ ctx, member, input }) => sendCommentPress(ctx, member, input),
});
