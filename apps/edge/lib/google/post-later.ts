/**
 * A post on its way to Google at its time (00616, the content redesign's stage 3; 00681): post_google. The picture was
 * drawn at the press and kept in the file's folder (`google.jpg`, the dashboard's server/posts/google.ts); here, at its
 * time, Google is asked to fetch it, once, after the recheck, through its adapter (place.ts), as
 * Instagram's send is (instagram/post-send.ts).
 *
 * The recheck, right before the send: whoever set it may still post for the business, the post was not deleted, and it
 * still stands as approved (00681 post_as_approved), with the exact bytes approved. Then the job says it is about to
 * speak (ledger markSpoke), and Google is asked. Google not connected, or its token lost, holds the post in words and
 * sends nothing, for the owner to post again once it is connected. A refusal fails the post in the owner's words. Google
 * keeps nothing to ask after, so a run that died after speaking is said so by the settle (jobs settle-post.ts), never
 * sent again blind.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, FILE_WORDS, MIN_MS, SECOND_MS, fileFolderOf, postPlanOf, recordOrEmpty } from "@chanlytics/contracts";
import {
  closePostAttempt,
  filesBucket,
  findPostForWork,
  movePost,
  openPostAttempt,
  type PostRow,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { CertainFailure } from "@chanlytics/core";
import { markSpoke, scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { logger } from "../shared/log.js";
import { tellPostMoved } from "../files/post-told.js";
import { googlePlace } from "./place.js";
import { holdPlacement, readSendRecheck } from "../content/recheck.js";

type Db = SupabaseClient<Database>;

const GOOGLE_SAYS = FILE_WORDS.google;

/** Long enough for Google to come for the picture, whenever it does after it answers. */
const GOOGLE_FETCH_LINK_S = DAY_MS / SECOND_MS;

/** The job's post and attempt. A payload that names neither is no post to send. */
function postJobOf(job: ClaimedJob): { postId: string; attempt: 1 | 2 } {
  const postId = typeof job.payload.post_id === "string" ? job.payload.post_id : "";
  if (!postId) throw new CertainFailure("post_google: no post on the job", GOOGLE_SAYS.notSent);
  return { postId, attempt: job.payload.attempt === "2" ? 2 : 1 };
}

/** How long Google is given before a post it was too busy for is asked once more. */
const GOOGLE_AGAIN_MS = 10 * MIN_MS;

/**
 * Google was too busy and made nothing (local-posts.ts BUSY_STATUSES): the post waits for one more ask, ten minutes on,
 * before its owner hears of it (Ruben, 12 Nov 2026). The second ask's job is written before the post moves back, so a post
 * is never left waiting with nothing to send it; a second busy answer fails it in the owner's words.
 */
async function askGoogleAgain(db: Db, post: PostRow, attemptId: string): Promise<{ skipped: string }> {
  await closePostAttempt(db, {
    attemptId,
    outcome: "refused",
    httpStatus: null,
    answer: null,
    error: { code: null, subcode: null, words: GOOGLE_SAYS.refused },
  });
  await scheduleJobOnce(db, {
    tenantId: post.tenant_id,
    kind: "post_google",
    dueAt: new Date(Date.now() + GOOGLE_AGAIN_MS),
    payload: { post_id: post.id, attempt: "2" },
  });
  await movePost(db, { postId: post.id, from: ["publishing"], to: "queued" });
  return { skipped: "busy" };
}

/** post_google: the recheck, then the one ask. */
export async function sendGooglePost(db: Db, job: ClaimedJob): Promise<void | { skipped: string }> {
  const { postId, attempt } = postJobOf(job);
  const post = await findPostForWork(db, job.tenant_id, postId);
  if (!post) return { skipped: "gone" };
  if (post.place !== "google" || post.status !== "queued") return { skipped: post.status };
  const checked = await readSendRecheck(db, post, { approver: true });
  if ("held" in checked) return holdPlacement(db, post, { ...checked, from: ["queued"] });
  // The approved picture, or the one drawn at the press; Google fetches it as it is asked. One not kept is no post to send.
  const picture = checked.path ?? `${fileFolderOf(post.tenant_id, post.file_id)}/google.jpg`;
  const signed = await filesBucket(db).createSignedUrl(picture, GOOGLE_FETCH_LINK_S);
  if (signed.error) throw new CertainFailure(`post_google: no picture for ${post.id}`, GOOGLE_SAYS.notSent);
  if (!(await movePost(db, { postId: post.id, from: ["queued"], to: "publishing" }))) return { skipped: "moved" };
  const opened = await openPostAttempt(db, {
    postId: post.id,
    attemptNo: attempt,
    step: "publish",
    request: { summary_chars: (post.caption ?? "").length, photo: new URL(signed.data.signedUrl).host },
  });
  await markSpoke(db, job);
  const plan = postPlanOf(recordOrEmpty(recordOrEmpty(checked.made).plan));
  const place = googlePlace(db, { tenantId: post.tenant_id, fileId: post.file_id, by: post.approved_by });
  const answer = await place.publish(
    {
      postId: post.id,
      kind: "picture",
      caption: post.caption,
      mediaUrl: signed.data.signedUrl,
      says: null,
      language: plan.language,
      book: plan.book,
    },
    null,
  );
  if (answer.is !== "sent") {
    // Google keeps nothing a send with no answer could be asked after: its wire answers a refusal or the post.
    const refusal = answer.is === "refused" ? answer.refusal : null;
    if (refusal?.busy && attempt === 1) return askGoogleAgain(db, post, opened.id);
    const words = refusal?.words ?? GOOGLE_SAYS.refused;
    const error = { code: null, subcode: null, words };
    await closePostAttempt(db, { attemptId: opened.id, outcome: "refused", httpStatus: null, answer: null, error });
    // Google let go of: nothing was sent, so it waits for the owner, as a recheck's hold does.
    if (refusal?.connectionLost)
      return holdPlacement(db, post, { held: words, why: "disconnected", from: ["publishing"] });
    await movePost(db, { postId: post.id, from: ["publishing"], to: "failed", patch: { error } });
    throw new CertainFailure(`post_google: Google refused ${post.id}`, words);
  }
  await closePostAttempt(db, {
    attemptId: opened.id,
    outcome: "ok",
    httpStatus: 200,
    answer: null,
    externalId: answer.media.externalId,
  });
  const moved = await movePost(db, {
    postId: post.id,
    from: ["publishing"],
    to: "published",
    patch: { external_id: answer.media.externalId, permalink: answer.media.permalink },
  });
  if (!moved) return;
  logger({ tenant_id: post.tenant_id }).info("post_published", { post_id: post.id, place: post.place });
  await tellPostMoved(db, post, { is: "up" });
}
