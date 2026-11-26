/**
 * The owner's word on a post its place never confirmed (the content status review of 24 Nov 2026, D5; POST
 * files/[id]/posts). Instagram, or a Page, took the post and was never read holding it, so nobody here can say it is
 * up; its owner can look, and says which. "It's there": it is up from now, as if the account had been read holding it.
 * "It's not there": it never went up, so it is a post that did not go, in those words, to post again; never a
 * take-down, since nothing was up to take down.
 *
 * The member's own read of the piece's posts says the post is theirs, and the route asks who may post; the word itself
 * goes through its own door as the member (post_seen_say, 00720), which asks the same again and moves the post through
 * post_moved, as every move of a post is, with its event and who said it.
 */
import "server-only";
import { AppError, ON_INSTAGRAM, POST_PLACES, STANDING_WORDS, isOneOf, postNeverSeen } from "@chanlytics/contracts";
import { listFilePosts, sayPostSeen, type FileMemberRow } from "@chanlytics/db/files";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/**
 * Whether the post moved. One that is no longer unconfirmed (seen meanwhile, taken down, let go) is left as it stands:
 * the page reads the piece again and says where that is.
 */
export async function sayWhetherPostIsThere(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { post_id: string; there: boolean },
): Promise<{ moved: boolean }> {
  const posts = await listFilePosts(ctx.supabase, member.tenantId, row.id);
  const post = posts.find((p) => p.id === input.post_id);
  if (!post) throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  const place = post.place;
  if (post.status !== "published" || !postNeverSeen(post) || !isOneOf(POST_PLACES, place)) return { moved: false };
  const moved = await sayPostSeen(ctx.supabase, {
    postId: post.id,
    there: input.there,
    words: input.there ? null : STANDING_WORDS.stopped.notThere(place),
  });
  return { moved };
}
