import { read } from "@/server/shared/route";
import { pieceScope, readPiece } from "@/server/content/piece-read";

/**
 * GET /api/v1/files/video/:id — where a video asked for stands, for its card to say once pressed: being made and where that is
 * at, made and still being looked at, ready, or not made and why; with its file once it is one. Every member of its workspace
 * reads it. A video deleted from Files is a 404: its record goes with it.
 *
 * The handle is in src/server/content/piece-read.ts.
 */
export const GET = read({
  scope: pieceScope,
  handle: ({ ctx, row }) => readPiece(ctx, row),
});
