/**
 * Take down (00682; the content loop PRD's 8.3; the journey canvas, board Piece, cells 36 to 40): the two presses behind
 * DELETE and PUT files/[id]/posts, each through its door on the member's own session, and the piece's newest take-down as
 * its sheet reads it (GET files/[id]). Asking a place and the place confirming are two times: nothing here says a post
 * is down. The take-down job does, once the place said so.
 */
import "server-only";
import { AppError, FILE_WORDS, ON_INSTAGRAM, TAKE_DOWN_WORDS, type PieceTakeDownDto } from "@chanlytics/contracts";
import {
  beginPostTakeDown,
  findPieceTakeDown,
  listFilePosts,
  markPostDeletedByHand,
  type FileMemberRow,
} from "@chanlytics/db/files";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/** DELETE files/[id]/posts: the piece comes down everywhere. Answers how much the press reached. */
export async function takePieceDown(ctx: RouteContext, member: Member, row: FileMemberRow) {
  const begun = await beginPostTakeDown(ctx.supabase, member.tenantId, row.id);
  if (begun.fate === "gone") throw new AppError("not_found", FILE_WORDS.gone, 404);
  if (begun.fate === "nothing") throw new AppError("conflict", TAKE_DOWN_WORDS.nothing, 409);
  return { asked: begun.asked, cancelled: begun.cancelled, ads: begun.ads };
}

/** PUT files/[id]/posts: "I deleted it". The place is asked whether the post is gone. */
export async function sayDeletedByHand(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { post_id: string },
) {
  const posts = await listFilePosts(ctx.supabase, member.tenantId, row.id);
  if (!posts.some((p) => p.id === input.post_id)) throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  const marked = await markPostDeletedByHand(ctx.supabase, member.tenantId, input.post_id);
  if (marked.fate === "unknown") throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  return { asking: marked.fate === "asking" };
}

/** The piece's newest take-down, for its sheet; null where nothing of it was ever asked down. */
export function readPieceTakeDown(
  ctx: RouteContext,
  member: Member,
  piece: { id: string; postIds: readonly string[] },
): Promise<PieceTakeDownDto | null> {
  return findPieceTakeDown(ctx.supabase, member.tenantId, { fileIds: [piece.id], postIds: piece.postIds });
}
