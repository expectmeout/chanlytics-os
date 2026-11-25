/**
 * A post its place took and does not hold (the content status review of 24 Nov 2026, A6): it never went up. It is not
 * left saying it was posted, and it is not taken down, since nothing was ever up to take down: it is a post that did not
 * go, in those words, and its owner is told as of any post that did not go, with the piece to post again. Asked by the
 * read that looks for a new post on its account (instagram/post-send.ts) once its last try still finds none, and by the
 * reads that find a post gone (content/observe.ts) where that post was never seen there.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST_PLACES, STANDING_WORDS, isOneOf } from "@chanlytics/contracts";
import { movePost, type PostRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { logger } from "../shared/log.js";
import { tellPostMoved } from "./post-told.js";

type Db = SupabaseClient<Database>;

/**
 * The post moved from published to not posted, with why, and its owner told once. Moved from published only, so two
 * reads never both move it nor both ring. `by` says which read found it. Answers whether this call moved it.
 */
export async function settleNeverUp(db: Db, post: PostRow, by: string): Promise<boolean> {
  const place = post.place;
  if (!isOneOf(POST_PLACES, place)) return false;
  const words = STANDING_WORDS.stopped.notThere(place);
  const moved = await movePost(db, {
    postId: post.id,
    from: ["published"],
    to: "failed",
    patch: { error: { code: null, subcode: null, words } },
  });
  logger({ tenant_id: post.tenant_id }).warn("post_not_seen", { post_id: post.id, place, by, moved });
  if (moved) await tellPostMoved(db, post, { is: "held", why: words });
  return moved;
}
