import { z } from "zod";
import { write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { makeLinkOfPost } from "@/server/content/post-link";

/**
 * POST /api/v1/files/[id]/link: a post of this piece's one link, made on first ask (00699; the content loop PRD's 9.2,
 * call 23): it opens a chat with the business carrying the post's code ("Message us"), or the booking page where the
 * piece was made to send people there. Answers its address, where it lands and how often it was opened. An owner, an
 * operator or a partner.
 */
export const POST = write({
  scope: fileScope,
  role: "operator",
  rate: "settings",
  input: z.strictObject({ post_id: z.uuid() }),
  handle: ({ ctx, member, row, input }) => makeLinkOfPost(ctx, member, row, input),
});
