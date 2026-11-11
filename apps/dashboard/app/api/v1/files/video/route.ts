import { write, workspace } from "@/server/shared/route";
import { beginPieceFor, pieceBeginInput } from "@/server/content/piece";

/**
 * POST /api/v1/files/video — a video made from the business's clips: Ask's card's Make it. The plan is checked afresh and the job
 * that draws it is started; the video lands in Files, under Made by Ask, about a minute on. No model is called. Pressed twice,
 * it is one video (the card's key). Whoever may change the workspace's settings, as a post's card.
 *
 * The handle is in src/server/content/piece.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "file_upload",
  input: pieceBeginInput,
  handle: ({ ctx, input, member }) => beginPieceFor(ctx, member, input),
});
