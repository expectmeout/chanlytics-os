/**
 * A public answer's job that ended for good (00696; the content loop PRD's 12.4): an answer never stays saying it is on
 * its way. A send whose run died, or whose last try threw, may have put the answer up, so it is said so, and never sent
 * again by itself: the owner looks under the comment, and Send is there again. If Meta delivers the answer back, it reads
 * as answered (post_own_comment_keep). A draft that never came leaves nothing to settle: the comment says AI wrote none.
 */
import { COMMENT_ANSWER_WORDS, recordOrEmpty } from "@chanlytics/contracts";
import { settleCommentAnswer } from "@chanlytics/db/content";
import type { Db } from "./ledger";
import type { TenantId } from "@chanlytics/contracts";

/** Whether an answer on its way was settled. */
export async function settleCommentReplyJob(
  db: Db,
  job: { tenant_id: TenantId; payload: unknown },
  certain: boolean,
  reason?: string,
): Promise<boolean> {
  const payload = recordOrEmpty(job.payload);
  const touchId = typeof payload.touch_id === "string" ? payload.touch_id : null;
  if (!touchId || payload.step !== "send") return false;
  return settleCommentAnswer(db, {
    tenantId: job.tenant_id,
    touchId,
    sent: false,
    said: certain ? (reason ?? COMMENT_ANSWER_WORDS.refused) : COMMENT_ANSWER_WORDS.unknown,
  });
}
