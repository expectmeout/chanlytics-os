/**
 * A post's job that ended for good (00611, decision 0121): the placement never stays saying it is on its way. Making it
 * ready that failed is a post not sent, in the words the refusal gave, or in the plain ones. A send that was certainly not
 * taken (Instagram refused it) is the same. A send whose run died, or whose answer never came, may have put the post up, so
 * it is never failed here: it is Checking, and Instagram is asked what it has two minutes on, before anything is sent again.
 * A send's job that ended before the post was being sent (the recheck could not read the database, the run died first)
 * sent nothing: the post is not left Getting ready for good, holding every later press; it did not go, in those words.
 */
import { ON_INSTAGRAM, recordOrEmpty, type PostStatus } from "@chanlytics/contracts";
import { markPostUnanswered, movePost } from "@chanlytics/db/files";
import type { Db } from "./ledger";
import type { TenantId } from "@chanlytics/contracts";

const failure = (words: string) => ({ error: { code: null, subcode: null, words } });

/** Whether the placement moved. */
export async function settlePostJob(
  db: Db,
  job: { kind: string; tenant_id: TenantId; payload: unknown },
  certain: boolean,
  reason?: string,
): Promise<boolean> {
  const payload = recordOrEmpty(job.payload);
  const postId = typeof payload.post_id === "string" ? payload.post_id : null;
  if (!postId) return false;
  const attempt = payload.attempt === "2" ? 2 : 1;
  const move = (from: readonly PostStatus[], to: PostStatus, words: string) =>
    movePost(db, { postId, from, to, patch: failure(words) });
  if (job.kind === "post_prepare") return move(["queued", "preparing"], "failed", reason ?? ON_INSTAGRAM.notSent);
  if (job.kind === "post_reconcile") return move(["checking"], "failed", ON_INSTAGRAM.refused.unknown);
  if (certain) return move(["preparing", "publishing"], "failed", reason ?? ON_INSTAGRAM.notSent);
  // Checking, with the reconcile that asks Instagram, written together (00611 post_unanswered). A post that was not being
  // sent yet is moved by neither: its send never began, so it is failed in words rather than left where it stood.
  if (await markPostUnanswered(db, postId, attempt)) return true;
  return move(["preparing"], "failed", ON_INSTAGRAM.notSent);
}
