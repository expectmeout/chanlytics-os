/**
 * A post's job that ended for good (00611, decision 0121): the placement never stays saying it is on its way. Making it
 * ready that failed is a post not sent, in the words the refusal gave, or in the plain ones. A send that was certainly not
 * taken (the place refused it) is the same. A send whose run died, or whose answer never came, may have put the post up, so
 * it is never failed here: it is Checking, and its place is asked what it has two minutes on, before anything is sent
 * again. Google's too, since its reconcile asks the profile (00728); it used to fail as "look on your profile".
 *
 * A send's job that ended before the post was being sent sent nothing. Where the send had written its own next ask (a
 * wait for a version, an opening that could not be read, Google too busy) and died before it reported back, that ask is
 * on the ledger and sends it: the post is left as it stands. It used to be failed under that ask, which then found a
 * failed post and did nothing. With no next ask, the post is not left Getting ready for good, holding every later
 * press: it did not go, in those words.
 */
import { DbFailure, FILE_WORDS, ON_INSTAGRAM, recordOrEmpty, type PostStatus } from "@chanlytics/contracts";
import { markPostUnanswered, movePost } from "@chanlytics/db/files";
import { countLivePostJobs } from "@chanlytics/db/jobs";
import type { Db } from "./ledger";
import type { TenantId } from "@chanlytics/contracts";

const failure = (words: string) => ({ error: { code: null, subcode: null, words } });
const GOOGLE_SAYS = FILE_WORDS.google;

/** Where a send stands before it begins, by its kind: Google's waits in the queue, Instagram's and a Page's made ready. */
const BEFORE_THE_SEND = { post_google: "queued", post_publish: "preparing" } as const satisfies Record<
  string,
  PostStatus
>;
const isSend = (kind: string): kind is keyof typeof BEFORE_THE_SEND => kind in BEFORE_THE_SEND;

/**
 * What became of the placement: `failed` (it did not go, and says so), `checking` (it may be up: its place is asked),
 * `waiting` (its own next ask is on the ledger and sends it), or `left` (it had moved on by itself).
 */
export type PostSettled = "failed" | "checking" | "waiting" | "left";

export async function settlePostJob(
  db: Db,
  job: { id: string; kind: string; tenant_id: TenantId; payload: unknown },
  certain: boolean,
  reason?: string,
): Promise<PostSettled> {
  const payload = recordOrEmpty(job.payload);
  const postId = typeof payload.post_id === "string" ? payload.post_id : null;
  if (!postId) return "left";
  const attempt = payload.attempt === "2" ? 2 : 1;
  const fail = async (from: readonly PostStatus[], words: string): Promise<PostSettled> =>
    (await movePost(db, { postId, from, to: "failed", patch: failure(words) })) ? "failed" : "left";
  if (job.kind === "post_prepare") return fail(["queued", "preparing"], reason ?? ON_INSTAGRAM.notSent);
  if (job.kind === "post_reconcile") return fail(["checking"], ON_INSTAGRAM.refused.unknown);
  if (!isSend(job.kind)) return "left";
  const before = BEFORE_THE_SEND[job.kind];
  const notSent = job.kind === "post_google" ? GOOGLE_SAYS.notSent : ON_INSTAGRAM.notSent;
  if (certain) return fail([before, "publishing"], reason ?? notSent);
  // Checking, with the reconcile that asks its place, written together (00611 post_unanswered).
  if (await markPostUnanswered(db, postId, attempt)) return "checking";
  // Not being sent. Its own next ask, where the send wrote one before it died, sends it: a read that cannot say is
  // raised, since failing a post under its own next ask is the one wrong answer here.
  const next = await countLivePostJobs(db, { tenantId: job.tenant_id, kind: job.kind, postId, besides: job.id });
  if (next.error) throw new DbFailure(next.error, "a post's next ask");
  if ((next.count ?? 0) > 0) return "waiting";
  return fail([before], notSent);
}
