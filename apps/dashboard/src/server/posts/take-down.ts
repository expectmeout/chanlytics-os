/**
 * Take down (00682; the content loop PRD's 8.3; the journey canvas, board Piece, cells 36 to 40): the presses behind
 * DELETE and PUT files/[id]/posts, each through its door on the member's own session, and the piece's newest take-down as
 * its sheet reads it (GET files/[id]). Asking a place and the place confirming are two times: nothing here says a post
 * is down. The take-down job does, once the place said so. A post a place left to its owner to delete stays up on the
 * owner's own word ("Keep it up", 00689).
 */
import "server-only";
import { AppError, FILE_WORDS, ON_INSTAGRAM, TAKE_DOWN_WORDS, type PieceTakeDownDto } from "@chanlytics/contracts";
import {
  beginPostTakeDown,
  findPieceTakeDown,
  keepPostUp,
  listFilePosts,
  markPostDeletedByHand,
  type FileMemberRow,
  type PieceTakeDownKept,
} from "@chanlytics/db/files";
import { readTeamRoster } from "@chanlytics/db/workspace";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/** DELETE files/[id]/posts: the piece comes down everywhere. Answers how much the press reached. */
export async function takePieceDown(ctx: RouteContext, member: Member, row: FileMemberRow) {
  const begun = await beginPostTakeDown(ctx.supabase, member.tenantId, row.id);
  if (begun.fate === "gone") throw new AppError("not_found", FILE_WORDS.gone, 404);
  if (begun.fate === "nothing") throw new AppError("conflict", TAKE_DOWN_WORDS.nothing, 409);
  return { asked: begun.asked, cancelled: begun.cancelled, ads: begun.ads };
}

/**
 * PUT files/[id]/posts, the owner's word about a post Chanlytics could not take down: "I deleted it" (the place is
 * asked whether the post is gone), or, with `keep`, "Keep it up" (the post stays, and nothing is asked). Answers where
 * the post's take-down now stands, for the page to read its piece again: asking, or left up.
 */
export async function sayOfPostByHand(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { post_id: string; keep?: true | undefined },
) {
  const posts = await listFilePosts(ctx.supabase, member.tenantId, row.id);
  if (!posts.some((p) => p.id === input.post_id)) throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  const { fate } = input.keep
    ? await keepPostUp(ctx.supabase, member.tenantId, input.post_id)
    : await markPostDeletedByHand(ctx.supabase, member.tenantId, input.post_id);
  if (fate === "unknown") throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  return { asking: fate === "asking", left_up: fate === "left_up" };
}

/**
 * A take-down as its sheet reads it: each post left up names who chose so (contracts TakeDownActionDto). The member
 * reading is "you"; a teammate goes by the name the roster has; one who gave no name, or has left since, has none.
 */
function namedFor(
  kept: PieceTakeDownKept,
  reader: string,
  nameOf: (userId: string) => string | null,
): PieceTakeDownDto {
  return {
    ...kept,
    actions: kept.actions.map((a) => ({
      ...a,
      left_up_by:
        a.outcome === "left_up"
          ? { you: a.left_up_by === reader, name: a.left_up_by ? nameOf(a.left_up_by) : null }
          : null,
    })),
  };
}

/**
 * The piece's newest take-down, for its sheet; null where nothing of it was ever asked down. The roster is read only
 * where a post was left up, to name who kept it.
 */
export async function readPieceTakeDown(
  ctx: RouteContext,
  member: Member,
  piece: { id: string; postIds: readonly string[] },
): Promise<PieceTakeDownDto | null> {
  const kept = await findPieceTakeDown(ctx.supabase, member.tenantId, { fileIds: [piece.id], postIds: piece.postIds });
  if (!kept) return null;
  const leftUp = kept.actions.some((a) => a.outcome === "left_up");
  const roster = leftUp ? ((await readTeamRoster(ctx.supabase, member.tenantId)).data ?? []) : [];
  // The roster answers an empty name for a member who gave none (team_roster), never a missing one.
  return namedFor(
    kept,
    ctx.userId,
    (userId) => roster.find((row) => row.member_user_id === userId)?.display_name.trim() || null,
  );
}
