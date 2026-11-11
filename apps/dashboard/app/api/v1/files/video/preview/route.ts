import { write, workspace } from "@/server/shared/route";
import { piecePlanInput, drawPieceBoardFor } from "@/server/content/piece-board";

/**
 * POST /api/v1/files/video/preview — a video's storyboard, for its card to show: the first frame of each cut with the opening words
 * where the video will show them, a JPEG, kept nowhere. A POST for the length of what it is asked. Whoever may make one.
 *
 * The handle is in src/server/content/piece-board.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "file_post_preview",
  input: piecePlanInput,
  handle: ({ ctx, input, member }) => drawPieceBoardFor(ctx, member, input),
});
