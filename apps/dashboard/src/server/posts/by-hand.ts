/**
 * A piece its owner posted themselves (00620; Ruben, 12 Nov 2026: "I posted it"). Nothing posts a video from here yet (decision
 * 0121): it is saved and posted from the phone, and the app never heard that it went up. The owner says so, with its link
 * where they have one, and takes it back the same way. Kept through its door on the member's own session, which asks the
 * settings permission itself (post_report), and taken back through Don't post's (post_pull).
 */
import "server-only";
import { AppError, CONTENT_WORDS, FILE_WORDS } from "@chanlytics/contracts";
import { listFilePosts, pullPost, reportPost, type FileMemberRow } from "@chanlytics/db/files";
import { handPostOf } from "@/server/readers/content";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/** What PATCH files/[id] is told of it: said, with its link or none; or null, taken back. */
export type ByHandWord = { link?: string | null | undefined } | null;

/** PATCH files/[id] `posted`: the owner's word that a made piece is up by their own hand, or that it is not after all. */
export async function sayPostedByHand(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  posted: ByHandWord,
): Promise<void> {
  if (row.source !== "made") throw new AppError("validation", CONTENT_WORDS.piece.byHand.notMade);
  if (posted === null) {
    // Taken back: the one it stands on, where there is one. None is what was asked for.
    const kept = handPostOf(await listFilePosts(ctx.supabase, member.tenantId, row.id));
    if (kept) await pullPost(ctx.supabase, kept.id);
    return;
  }
  const answer = await reportPost(ctx.supabase, {
    tenantId: member.tenantId,
    fileId: row.id,
    link: posted.link?.trim() || null,
  });
  if (answer.fate === "gone") throw new AppError("not_found", FILE_WORDS.gone, 404);
  if (answer.fate === "not_a_post") throw new AppError("validation", CONTENT_WORDS.piece.byHand.notMade);
}
