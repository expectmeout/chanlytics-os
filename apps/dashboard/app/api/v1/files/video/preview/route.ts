import { write, workspace } from "@/server/shared/route";
import { pieceBoardInput, drawPieceBoardFor } from "@/server/content/piece-board";

/**
 * POST /api/v1/files/video/preview — a video's storyboard, for its card to show: each block as the video will show it, the opening
 * words where it will show them, a JPEG, kept nowhere. A POST for the length of what it is asked. Whoever may make one.
 *
 * The handle is in src/server/content/piece-board.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "file_post_preview",
  input: pieceBoardInput,
  handle: ({ ctx, input, member }) => drawPieceBoardFor(ctx, member, input),
});
