import "server-only";

/**
 * A post's one link, made on the owner's ask from the piece (00692; the content loop PRD's 9.2, call 23): it opens a
 * chat with the business carrying the post's code, or the booking page where the piece was made to send people there.
 * Made by its door on the member's own session (post_link_make: a member who may act); the page draws its address from
 * its own origin (`/l/<code>`), as Forms' links are.
 */
import { AppError } from "@chanlytics/contracts";
import { makePostLink } from "@chanlytics/db/content";
import { listFilePosts } from "@chanlytics/db/files";
import type { FileMemberRow } from "@chanlytics/db/files";
import type { Member } from "../shared/route";
import type { RouteContext } from "../shared/with-route";

/** What the piece is answered: the link's code, where it lands, and how often it was opened. */
interface PiecePostLink {
  code: string;
  lands: "chat" | "booking";
  opens: number;
}

/** The link of one of this piece's posts that went up, made on first ask. */
export async function makeLinkOfPost(
  ctx: RouteContext,
  member: Member,
  file: FileMemberRow,
  input: { post_id: string },
): Promise<PiecePostLink> {
  const posts = await listFilePosts(ctx.supabase, member.tenantId, file.id);
  if (!posts.some((post) => post.id === input.post_id && post.published_at))
    throw new AppError("not_found", "That post isn't up, so it has no link yet.", 404);
  const link = await makePostLink(ctx.supabase, member.tenantId, input.post_id);
  if (!link) throw new AppError("conflict", "The link couldn't be made. Try again.", 409);
  return { code: link.code, lands: link.lands, opens: link.opens };
}
