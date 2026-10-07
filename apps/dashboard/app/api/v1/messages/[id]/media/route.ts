import { read, workspace } from "@/server/route";
import { messageMedia } from "@/server/conversations/message-media";

/**
 * GET /api/v1/messages/:id/media — a redirect to a short-lived signed URL
 * for a stored attachment. A member of the named workspace; only an
 * attachment the edge has actually stored; a redirect built by hand, because
 * Response.redirect()'s headers are immutable and the wrapper stamps its own.
 *
 * The handle is messageMedia in src/server/conversations/message-media.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const GET = read({
  scope: workspace,
  handle: ({ ctx, member }) => messageMedia(ctx, member),
});
