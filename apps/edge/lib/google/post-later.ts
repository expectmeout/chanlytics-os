/**
 * A post on its way to Google at its time (00616, the content redesign's stage 3; 00681): post_google. The picture was
 * drawn at the press and kept in the file's folder (`google.jpg`, the dashboard's server/posts/google.ts); here, at its
 * time, Google is asked to fetch it, once, after the recheck, through its adapter (place.ts), as
 * Instagram's send is (instagram/post-send.ts).
 *
 * The recheck, right before the send: whoever set it may still post for the business, the post was not deleted, and it
 * still stands as approved (00681 post_as_approved), with the exact bytes approved. Then the job says it is about to
 * speak (ledger markSpoke), and Google is asked. Google not connected, or its token lost, holds the post in words and
 * sends nothing, for the owner to post again once it is connected. A refusal fails the post in the owner's words.
 *
 * An ask Google neither took nor refused proves nothing: the post may be up. It is Checking, as Instagram's is, and two
 * minutes on the profile is asked what it holds (reconcileGooglePost): a post made there since the send, which no other
 * placement keeps, is this one, and it is up under Google's name for it. None, with the profile read whole: the send
 * never landed, and one more ask begins, never a third. A profile that cannot be read is asked again, and past its
 * last try the post says to look. A run that died after speaking is still said so by the settle (jobs settle-post.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, FILE_WORDS, MIN_MS, SECOND_MS, fileFolderOf, postPlanOf, recordOrEmpty } from "@chanlytics/contracts";
import {
  closePostAttempt,
  filesBucket,
  findPostForWork,
  listKeptPostIds,
  listPostAttempts,
  markPostUnanswered,
  movePost,
  openPostAttempt,
  type PostRow,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { CertainFailure } from "@chanlytics/core";
import { MAX_ATTEMPTS, markSpoke, scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { logger } from "../shared/log.js";
import { tellPostMoved } from "../files/post-told.js";
import { listSentOnProfile, type SentOnProfile } from "./local-posts.js";
import { googlePlace } from "./place.js";
import { OPENING_ASK_MS, askAgainOrHold, holdPlacement, readSendRecheck } from "../content/recheck.js";

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
  // The open time it promises could not be read (00728): asked again a minute on, then held, never sent on a guess.
  if ("unread" in checked)
    return askAgainOrHold(db, post, job, {
      ...checked,
      from: ["queued"],
      again: (unread) =>
        scheduleJobOnce(db, {
          tenantId: post.tenant_id,
          kind: "post_google",
          dueAt: new Date(Date.now() + OPENING_ASK_MS),
          payload: { post_id: post.id, attempt: String(attempt), unread },
        }),
    });
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
  if (answer.is === "unknown") {
    // No answer proves nothing: Checking, and the profile is asked what it holds before anything is sent again.
    await closePostAttempt(db, { attemptId: opened.id, outcome: "no_answer", httpStatus: null, answer: null });
    await markPostUnanswered(db, post.id, attempt);
    logger({ tenant_id: post.tenant_id }).warn("post_no_answer", { post_id: post.id });
    return;
  }
  if (answer.is === "refused") {
    const { refusal } = answer;
    if (refusal.busy && attempt === 1) return askGoogleAgain(db, post, opened.id);
    const { words } = refusal;
    const error = { code: null, subcode: null, words };
    await closePostAttempt(db, { attemptId: opened.id, outcome: "refused", httpStatus: null, answer: null, error });
    // Google let go of: nothing was sent, so it waits for the owner, as a recheck's hold does.
    if (refusal.connectionLost)
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

/** A send began this long before Google stamped its post still made it: Google's clock and this one's may differ a little. */
const CLOCK_SLACK_MS = MIN_MS;

/**
 * Of what the profile holds since the send, the post this send made: the first made since then that no other placement
 * of this workspace keeps. Null where none is. Google's list gives no words to tell it by, so its time and its being
 * nobody else's are what say it.
 */
async function sentBy(db: Db, post: PostRow, held: readonly SentOnProfile[]): Promise<SentOnProfile | null> {
  const kept = await listKeptPostIds(
    db,
    post.tenant_id,
    "google",
    held.map((one) => one.name),
  );
  return held.find((one) => !kept.includes(one.name)) ?? null;
}

/** The post settled as one that did not go, in the owner's words, and the bell says so: nothing more is sent. */
async function settleNotUp(db: Db, post: PostRow, words: string): Promise<void> {
  const error = { code: null, subcode: null, words };
  if (await movePost(db, { postId: post.id, from: ["checking"], to: "failed", patch: { error } }))
    await tellPostMoved(db, post, { is: "held", why: words });
}

/**
 * post_reconcile, for a post sent to Google with no answer: what the profile holds, read before anything could be sent
 * again. Up, under Google's name, where the profile shows a post made since the send that nobody else keeps; one Google
 * took and then rejected did not go, in Google's words, and is not sent again. None, the profile read whole: the send
 * never landed, so its second and last ask begins; a second that never landed is told. A profile that cannot be read
 * brings the job back, and on its last try the post says to look. Nothing is ever sent from here.
 */
export async function reconcileGooglePost(db: Db, post: PostRow, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (post.status !== "checking") return { skipped: post.status };
  const { attempt } = postJobOf(job);
  const sends = await listPostAttempts(db, post.tenant_id, post.id);
  // In the order they were made: the first send is the earliest a post of this one can be.
  const send = sends.find((a) => a.step === "publish");
  const since = new Date((send ? Date.parse(send.started_at) : Date.parse(post.updated_at)) - CLOCK_SLACK_MS);
  let held: SentOnProfile[] | null;
  try {
    held = await listSentOnProfile(db, post.tenant_id, since);
    if (held === null) throw new Error(`post ${post.id}: the profile cannot be asked what it holds`);
  } catch (e) {
    // Not read is not "none": asked again, and where the last try could not read it either, a person looks.
    if ((job.attempts ?? 1) < MAX_ATTEMPTS) throw e;
    await settleNotUp(db, post, GOOGLE_SAYS.unknown);
    return { skipped: "unread" };
  }
  const found = await sentBy(db, post, held);
  const opened = await openPostAttempt(db, {
    postId: post.id,
    attemptNo: attempt,
    step: "reconcile",
    request: { since: since.toISOString(), held: String(held.length) },
  });
  if (found && !found.rejected) {
    await closePostAttempt(db, {
      attemptId: opened.id,
      outcome: "ok",
      httpStatus: 200,
      answer: null,
      externalId: found.name,
    });
    const moved = await movePost(db, {
      postId: post.id,
      from: ["checking"],
      to: "published",
      patch: { external_id: found.name, permalink: found.search_url },
    });
    if (!moved) return;
    logger({ tenant_id: post.tenant_id }).info("post_published", { post_id: post.id, place: post.place });
    await tellPostMoved(db, post, { is: "up" });
    return;
  }
  await closePostAttempt(db, { attemptId: opened.id, outcome: "failed", httpStatus: 200, answer: null });
  // Google took it and turned it down: sending the same post again would only be turned down again.
  if (found) return settleNotUp(db, post, GOOGLE_SAYS.refused);
  if (attempt === 2) return settleNotUp(db, post, GOOGLE_SAYS.notSent);
  // The send never landed: its second and last ask, written before the post moves back to waiting.
  await scheduleJobOnce(db, {
    tenantId: post.tenant_id,
    kind: "post_google",
    dueAt: new Date(),
    payload: { post_id: post.id, attempt: "2" },
  });
  await movePost(db, { postId: post.id, from: ["checking"], to: "queued" });
  return { skipped: "again" };
}
