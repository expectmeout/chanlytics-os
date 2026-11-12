/**
 * A post on its way to Google at its time (00616, the content redesign's stage 3): post_google. The picture was drawn at the
 * press and kept in the file's folder (`google.jpg`, the dashboard's server/posts/google.ts); here, at its time, Google is
 * asked to fetch it, once, after the recheck, as Instagram's send is (instagram/post-send.ts).
 *
 * The recheck, right before the send: whoever set it may still post for the business, and the post was not deleted. Then
 * the job says it is about to speak (ledger markSpoke), and Google is asked. Google not connected, or its token lost, holds
 * the post in words and sends nothing, for the owner to post again once it is connected. A refusal fails the post in the
 * owner's words. Google keeps nothing to ask after, so a run that died after speaking is said so by the settle
 * (jobs settle-post.ts), never sent again blind.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAY_MS,
  FILE_WORDS,
  ON_INSTAGRAM,
  SECOND_MS,
  fileFolderOf,
  postPlanOf,
  recordOrEmpty,
} from "@chanlytics/contracts";
import {
  closePostAttempt,
  filesBucket,
  findFileForWork,
  findPostForWork,
  mayStillPost,
  movePost,
  openPostAttempt,
  type PostRow,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { CertainFailure } from "@chanlytics/core";
import { markSpoke, type ClaimedJob } from "@chanlytics/jobs";
import { logger } from "../shared/log.js";
import { tellPostMoved } from "../files/post-told.js";
import { postOnProfile } from "./local-posts.js";

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

/** Held at its time, in words, with nothing sent: the bell says so, as Instagram's hold does. */
async function holdForGoogle(db: Db, post: PostRow, words: string): Promise<{ skipped: string }> {
  const moved = await movePost(db, { postId: post.id, from: ["queued"], to: "held", patch: { held_reason: words } });
  logger({ tenant_id: post.tenant_id }).info("post_held", { post_id: post.id });
  if (moved) await tellPostMoved(db, post, { is: "held", why: words });
  return { skipped: "held" };
}

/** The recheck: why the post may not go now, in the owner's words, or nothing. */
async function recheck(db: Db, post: PostRow): Promise<string | null> {
  if (!post.approved_by || !(await mayStillPost(db, post.tenant_id, post.approved_by)))
    return ON_INSTAGRAM.held.approver;
  const file = await findFileForWork(db, post.tenant_id, post.file_id);
  if (!file || file.removed_at) return ON_INSTAGRAM.held.removed;
  return null;
}

/** post_google: the recheck, then the one ask. */
export async function sendGooglePost(db: Db, job: ClaimedJob): Promise<void | { skipped: string }> {
  const { postId, attempt } = postJobOf(job);
  const post = await findPostForWork(db, job.tenant_id, postId);
  if (!post) return { skipped: "gone" };
  if (post.place !== "google" || post.status !== "queued") return { skipped: post.status };
  const held = await recheck(db, post);
  if (held) return holdForGoogle(db, post, held);
  const file = await findFileForWork(db, post.tenant_id, post.file_id);
  if (!file) return holdForGoogle(db, post, ON_INSTAGRAM.held.removed);
  // The picture drawn at the press; Google fetches it as it is asked. One not kept is no post to send.
  const picture = `${fileFolderOf(post.tenant_id, file.id)}/google.jpg`;
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
  const plan = postPlanOf(recordOrEmpty(recordOrEmpty(file.made).plan));
  const answer = await postOnProfile(db, post.tenant_id, {
    fileId: file.id,
    by: post.approved_by,
    post: {
      summary: post.caption ?? "",
      photoUrl: signed.data.signedUrl,
      languageCode: plan.language,
      call: plan.book,
    },
  });
  if (!answer.ok) {
    const lost = answer.error === "not_connected" || answer.error === "no_token";
    const words = lost
      ? GOOGLE_SAYS.heldNoConnection
      : `${GOOGLE_SAYS.refused}${answer.detail ? ` ${answer.detail.slice(0, 200)}` : ""}`;
    const error = { code: null, subcode: null, words };
    await closePostAttempt(db, { attemptId: opened.id, outcome: "refused", httpStatus: null, answer: null, error });
    // Google let go of: nothing was sent, so it waits for the owner, as a recheck's hold does.
    if (lost) {
      await movePost(db, { postId: post.id, from: ["publishing"], to: "held", patch: { held_reason: words } });
      await tellPostMoved(db, post, { is: "held", why: words });
      return { skipped: "held" };
    }
    await movePost(db, { postId: post.id, from: ["publishing"], to: "failed", patch: { error } });
    throw new CertainFailure(`post_google: Google refused ${post.id}`, words);
  }
  await closePostAttempt(db, {
    attemptId: opened.id,
    outcome: "ok",
    httpStatus: 200,
    answer: null,
    externalId: answer.name,
  });
  const moved = await movePost(db, {
    postId: post.id,
    from: ["publishing"],
    to: "published",
    patch: { external_id: answer.name, permalink: answer.search_url },
  });
  if (!moved) return;
  logger({ tenant_id: post.tenant_id }).info("post_published", { post_id: post.id, place: post.place });
  await tellPostMoved(db, post, { is: "up" });
}
