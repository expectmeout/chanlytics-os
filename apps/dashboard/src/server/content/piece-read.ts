/**
 * GET files/video/[id], for a member: where a video asked for stands, as its card reads it once pressed (contracts
 * PieceFollowedDto; the content canvas's states): its own row and, once it is one, the file it became. Read under the caller's
 * RLS, so a video of a workspace that is not theirs is a 404, and so is one deleted from Files (its row goes with its file).
 * Nothing is written and no model is called: a card asks this again while its video is being made.
 */
import "server-only";
import {
  AppError,
  PIECE_FAILS,
  PIECE_STAGES,
  PIECE_STATUSES,
  isOneOf,
  pieceWordsIn,
  type PieceFollowedDto,
} from "@chanlytics/contracts";
import { findFile, findPiece, type PieceMemberRow } from "@chanlytics/db/files";
import { fileDtoOf } from "@/server/readers/files";
import { requireUuid } from "@/server/shared/request-guards";
import { row } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/** A video asked for that the caller may see (RLS), or a 404. */
export const pieceScope = row(async (ctx: RouteContext, params): Promise<PieceMemberRow> => {
  const found = await findPiece(ctx.supabase, requireUuid(params.id, "video"));
  if (!found) throw new AppError("not_found", pieceWordsIn("en").follows.gone, 404);
  return found;
});

/** Where it stands, each word held to its closed set: one this build does not know reads as the first of its set. */
export async function readPiece(ctx: RouteContext, piece: PieceMemberRow): Promise<PieceFollowedDto> {
  const file = piece.file_id ? await findFile(ctx.supabase, piece.file_id) : null;
  return {
    status: isOneOf(PIECE_STATUSES, piece.status) ? piece.status : "making",
    stage: isOneOf(PIECE_STAGES, piece.stage) ? piece.stage : "queued",
    failed_why: isOneOf(PIECE_FAILS, piece.failed_why) ? piece.failed_why : null,
    file: file ? fileDtoOf(file) : null,
  };
}
