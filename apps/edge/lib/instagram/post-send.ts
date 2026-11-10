/**
 * A post sent (00611, decision 0121): post_publish and post_reconcile. Publishing works like a payment: the send is made
 * once, and an answer that never came proves nothing, so it is never sent again blind.
 *
 * Right before the send, the recheck: whoever approved it may still post for the business, the post was not pulled or
 * removed, and Instagram is still connected with posting allowed. Anything moved holds the post in words and sends nothing,
 * up to the moment of sending. Then the job says it is about to speak (ledger markSpoke), and Instagram is asked to publish.
 * A refusal fails the post in the owner's words; no answer leaves it Checking, and two minutes on the reconcile asks
 * Instagram what it has: the container's status and the account's newest posts. Found, it is up. Not found, it was not
 * sent, and one fresh attempt begins, never a third.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ON_INSTAGRAM } from "@chanlytics/contracts";
import {
  callInstagram,
  metaContainerStatusRequest,
  metaMediaReadRequest,
  metaMediaSentBy,
  metaNewestMediaRequest,
  metaPublishRequest,
  parseMetaContainerStatus,
  parseMetaCreatedId,
  parseMetaMedia,
  parseMetaMediaList,
  type MetaMedia,
  type MetaPoster,
} from "@chanlytics/channels/instagram";
import {
  closePostAttempt,
  findFileForWork,
  findPostForWork,
  listPostAttempts,
  markPostUnanswered,
  mayStillPost,
  movePost,
  openPostAttempt,
  type PostRow,
} from "@chanlytics/db/files";
import { CertainFailure } from "@chanlytics/core";
import { logAndGoOn } from "@chanlytics/log";
import { markSpoke, type ClaimedJob, type JobContext } from "@chanlytics/jobs";
import type { Database } from "@chanlytics/db/types";
import { logger } from "../shared/log.js";
import {
  POST_CALL_MS,
  beginSecondAttempt,
  holdPost,
  instagramKindOf,
  postJobOf,
  findPoster,
  preparePost,
  refusalKept,
  postRefusalOf,
  type PostDeps,
} from "./post-ready.js";

type Db = SupabaseClient<Database>;

/** The recheck: why the post may not go now, in the owner's words, or the poster it goes through. */
async function recheck(db: Db, post: PostRow): Promise<{ poster: MetaPoster } | { held: string }> {
  if (!post.approved_by || !(await mayStillPost(db, post.tenant_id, post.approved_by)))
    return { held: ON_INSTAGRAM.held.approver };
  const file = await findFileForWork(db, post.tenant_id, post.file_id);
  if (!file || file.removed_at) return { held: ON_INSTAGRAM.held.removed };
  return findPoster(db, post.tenant_id);
}

/** The post is up: its id, its address and its time kept where they are known, and the line that says so. */
async function keepPublished(db: Db, post: PostRow, media: Partial<MetaMedia> | null): Promise<void> {
  await movePost(db, {
    postId: post.id,
    from: ["publishing", "checking"],
    to: "published",
    patch: {
      external_id: media?.id || null,
      permalink: media?.permalink ?? null,
      published_at: media?.timestamp ?? null,
    },
  });
  logger({ tenant_id: post.tenant_id }).info("post_published", { post_id: post.id, place: post.place });
}

/** post_publish: the recheck, then the one send. */
export async function publishPost(db: Db, job: ClaimedJob, deps: PostDeps = {}): Promise<void | { skipped: string }> {
  const { postId, attempt } = postJobOf(job);
  const post = await findPostForWork(db, job.tenant_id, postId);
  if (!post) return { skipped: "gone" };
  if (post.status !== "preparing" || !post.container_id) return { skipped: post.status };
  instagramKindOf(post);
  const posting = await recheck(db, post);
  if ("held" in posting) return holdPost(db, post, posting.held);
  if (!(await movePost(db, { postId: post.id, from: ["preparing"], to: "publishing" }))) return { skipped: "moved" };
  const opened = await openPostAttempt(db, {
    postId: post.id,
    attemptNo: attempt,
    step: "publish",
    request: { creation_id: post.container_id },
  });
  await markSpoke(db, job);
  const sent = await callInstagram(
    metaPublishRequest(posting.poster, post.container_id),
    { timeoutMs: POST_CALL_MS },
    deps,
  );
  if (sent.outcome === "refused") {
    // Instagram answered, and took nothing: the post did not go up.
    const error = refusalKept(sent);
    await closePostAttempt(db, {
      attemptId: opened.id,
      outcome: "refused",
      httpStatus: sent.status,
      answer: sent.json,
      error,
    });
    await movePost(db, { postId: post.id, from: ["publishing"], to: "failed", patch: { error } });
    const refused = postRefusalOf(sent, `post ${post.id}`);
    throw new CertainFailure(refused.message, error.words);
  }
  if (sent.outcome !== "ok") {
    // No answer proves nothing: Checking, and Instagram is asked what it has before anything is sent again.
    await closePostAttempt(db, {
      attemptId: opened.id,
      outcome: "no_answer",
      httpStatus: sent.status || null,
      answer: null,
    });
    await markPostUnanswered(db, post.id, attempt);
    logger({ tenant_id: job.tenant_id }).warn("post_no_answer", { post_id: post.id });
    return;
  }
  const mediaId = parseMetaCreatedId(sent.json);
  await closePostAttempt(db, {
    attemptId: opened.id,
    outcome: "ok",
    httpStatus: sent.status,
    answer: sent.json,
    externalId: mediaId,
  });
  // Its address, for the sheet's See it: a read that fails leaves the post up without one.
  const read = await callInstagram(metaMediaReadRequest(posting.poster, mediaId), { timeoutMs: POST_CALL_MS }, deps);
  await keepPublished(db, post, (read.outcome === "ok" ? parseMetaMedia(read.json) : null) ?? { id: mediaId });
}

/** Of the account's newest, the one this post's send made; null when none is, or none could be read. */
async function foundOnTheAccount(
  db: Db,
  at: { post: PostRow; poster: MetaPoster; attempt: 1 | 2 },
  deps: PostDeps,
): Promise<MetaMedia | null> {
  const sends = await listPostAttempts(db, at.post.tenant_id, at.post.id);
  const send = sends.find((a) => a.step === "publish" && a.attempt_no === at.attempt);
  if (!send) return null;
  const listed = await callInstagram(
    metaNewestMediaRequest(at.poster, instagramKindOf(at.post)),
    { timeoutMs: POST_CALL_MS },
    deps,
  );
  if (listed.outcome !== "ok") throw new Error(`post ${at.post.id}: the account's posts could not be read`);
  return metaMediaSentBy(parseMetaMediaList(listed.json), { at: send.started_at, caption: at.post.caption });
}

/** post_reconcile: what Instagram has, read before anything could be sent again. */
export async function reconcilePost(db: Db, job: ClaimedJob, deps: PostDeps = {}): Promise<void | { skipped: string }> {
  const { postId, attempt } = postJobOf(job);
  const post = await findPostForWork(db, job.tenant_id, postId);
  if (!post) return { skipped: "gone" };
  if (post.status !== "checking" || !post.container_id) return { skipped: post.status };
  const posting = await findPoster(db, job.tenant_id);
  // Instagram cannot be asked: the job comes back, and past its last try the post says to look at the account.
  if ("held" in posting) throw new Error(`post ${post.id}: Instagram cannot be asked (${posting.held})`);
  const read = await callInstagram(
    metaContainerStatusRequest(posting.poster, post.container_id),
    { timeoutMs: POST_CALL_MS },
    deps,
  );
  if (read.outcome !== "ok") throw new Error(`post ${post.id}: the container could not be read`);
  const status = parseMetaContainerStatus(read.json);
  const opened = await openPostAttempt(db, {
    postId: post.id,
    attemptNo: attempt,
    step: "reconcile",
    request: { container_id: post.container_id },
  });
  // Published, the account's list is only for its address: one that cannot be read leaves the post up without it.
  const looking = foundOnTheAccount(db, { post, poster: posting.poster, attempt }, deps);
  const found =
    status.code === "PUBLISHED"
      ? await looking.catch(logAndGoOn("post's address after a send with no answer", null))
      : await looking;
  if (found || status.code === "PUBLISHED") {
    await closePostAttempt(db, {
      attemptId: opened.id,
      outcome: "ok",
      httpStatus: read.status,
      answer: read.json,
      externalId: found?.id ?? null,
    });
    await keepPublished(db, post, found);
    return;
  }
  // Not up: the send never landed. One fresh attempt, and never a third.
  await closePostAttempt(db, { attemptId: opened.id, outcome: "failed", httpStatus: read.status, answer: read.json });
  if (attempt === 1) return beginSecondAttempt(db, post, "checking");
  await movePost(db, {
    postId: post.id,
    from: ["checking"],
    to: "failed",
    patch: { error: { code: null, subcode: null, words: ON_INSTAGRAM.notSent } },
  });
  throw new CertainFailure(`post ${post.id}: not up after two attempts`, ON_INSTAGRAM.notSent);
}

/** The three post jobs as the job runner is handed them (lib/ops/jobs-tick.ts). */
export function postJobs(db: Db, deps: PostDeps = {}): NonNullable<JobContext["posts"]> {
  return {
    prepare: (job, deadline) => preparePost(db, job, deadline, deps),
    publish: (job) => publishPost(db, job, deps),
    reconcile: (job) => reconcilePost(db, job, deps),
  };
}
